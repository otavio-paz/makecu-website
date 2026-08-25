const { hashPassword } = require("./checkout-security");
const { componentInput, cleanString, httpError, positiveInteger, returnInput } = require("./checkout-validation");

function componentView(row) {
  const total = Number(row.total_quantity);
  const reserved = Number(row.reserved_quantity);
  const checkedOut = Number(row.checked_out_quantity);
  const unavailable = Number(row.unavailable_quantity);

  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    category: row.category,
    compatibility: row.compatibility,
    totalQuantity: total,
    reservedQuantity: reserved,
    checkedOutQuantity: checkedOut,
    unavailableQuantity: unavailable,
    availableQuantity: total - reserved - checkedOut - unavailable,
    maxActivePerTeam: row.max_active_per_team == null ? null : Number(row.max_active_per_team),
    teamActiveQuantity: Number(row.team_active_quantity || 0),
    active: row.active,
    adminNotes: row.admin_notes,
    updatedAt: row.updated_at
  };
}

function orderView(row, items) {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    teamName: row.team_name,
    status: row.status,
    reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
    reviewingAt: row.reviewing_at,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    cancelledAt: row.cancelled_at,
    items: items || []
  };
}

function itemView(row) {
  return {
    id: Number(row.id),
    componentId: Number(row.component_id),
    name: row.name,
    imageUrl: row.image_url,
    category: row.category,
    requestedQuantity: Number(row.requested_quantity),
    approvedQuantity: Number(row.approved_quantity),
    adjustmentReason: row.adjustment_reason,
    note: row.note
  };
}

async function orderItems(database, orderIds) {
  if (!orderIds.length) {
    return new Map();
  }

  const result = await database.query(
    `SELECT items.*, components.name, components.image_url, components.category
       FROM checkout_order_items items
       JOIN checkout_components components ON components.id = items.component_id
      WHERE items.order_id = ANY($1::bigint[])
      ORDER BY items.id`,
    [orderIds]
  );
  const grouped = new Map();

  result.rows.forEach(function (row) {
    const orderId = Number(row.order_id);

    if (!grouped.has(orderId)) {
      grouped.set(orderId, []);
    }

    grouped.get(orderId).push(itemView(row));
  });

  return grouped;
}

async function catalog(database, user, includeInactive) {
  const teamId = user && user.role === "team" ? user.team_id : null;
  const result = await database.query(
    `SELECT components.*,
            COALESCE(inventory.checked_out_quantity, 0) +
            COALESCE(reservations.quantity, 0) AS team_active_quantity
       FROM checkout_components components
       LEFT JOIN checkout_team_inventory inventory
         ON inventory.component_id = components.id AND inventory.team_id = $1
       LEFT JOIN (
         SELECT items.component_id, SUM(items.approved_quantity) AS quantity
           FROM checkout_order_items items
           JOIN checkout_orders orders ON orders.id = items.order_id
          WHERE orders.team_id = $1
            AND orders.status IN ('submitted', 'reviewing', 'ready')
          GROUP BY items.component_id
       ) reservations ON reservations.component_id = components.id
      WHERE ($2::boolean = TRUE OR components.active = TRUE)
      ORDER BY components.category, components.name`,
    [teamId, Boolean(includeInactive)]
  );

  return result.rows.map(componentView);
}

async function createTeam(database, body, actor) {
  const name = cleanString(body.name, "Team name", { max: 120 });
  const identifier = cleanString(body.identifier, "Team identifier", { max: 80 }).toLowerCase();
  const username = cleanString(body.username || identifier, "Username", { max: 80 }).toLowerCase();
  const password = cleanString(body.password, "Password", { max: 200 });

  if (password.length < 8) {
    throw httpError(400, "Team passwords must be at least 8 characters.");
  }

  try {
    return await database.transaction(async function (transaction) {
      const teamResult = await transaction.query(
        "INSERT INTO checkout_teams (name, identifier) VALUES ($1, $2) RETURNING *",
        [name, identifier]
      );
      const team = teamResult.rows[0];
      const passwordHash = await hashPassword(password);
      const userResult = await transaction.query(
        `INSERT INTO checkout_users (username, password_hash, role, team_id, display_name)
         VALUES ($1, $2, 'team', $3, $4)
         RETURNING id, username, role, team_id, display_name`,
        [username, passwordHash, team.id, name]
      );
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, team_id, message)
         VALUES ($1, $2, $3)`,
        [actor.id, team.id, `Created credentials for Team ${name}.`]
      );
      return { team, user: userResult.rows[0] };
    });
  } catch (error) {
    if (error.code === "23505") {
      throw httpError(409, "That team identifier or username is already in use.");
    }

    throw error;
  }
}

async function resetTeamPassword(database, body, actor) {
  const teamId = positiveInteger(body.teamId, "Team ID");
  const password = cleanString(body.password, "Password", { max: 200 });

  if (password.length < 8) {
    throw httpError(400, "Team passwords must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);
  const result = await database.query(
    `UPDATE checkout_users SET password_hash = $1
      WHERE team_id = $2 AND role = 'team'
      RETURNING id`,
    [passwordHash, teamId]
  );

  if (!result.rows.length) {
    throw httpError(404, "Team account not found.");
  }

  await database.query("DELETE FROM checkout_sessions WHERE user_id = $1", [result.rows[0].id]);
  await database.query(
    `INSERT INTO checkout_activity (actor_user_id, team_id, message)
     VALUES ($1, $2, 'Reset the team password.')`,
    [actor.id, teamId]
  );
  return { reset: true };
}

async function saveComponent(database, body, actor) {
  const input = componentInput(body);
  const componentId = body.id == null ? null : positiveInteger(body.id, "Component ID");

  return database.transaction(async function (transaction) {
    if (!componentId) {
      if (input.unavailableQuantity > input.totalQuantity) {
        throw httpError(409, "Unavailable quantity cannot exceed total inventory.");
      }

      const created = await transaction.query(
        `INSERT INTO checkout_components
          (name, description, image_url, category, compatibility, total_quantity,
           unavailable_quantity, max_active_per_team, active, admin_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [input.name, input.description, input.imageUrl, input.category, input.compatibility,
          input.totalQuantity, input.unavailableQuantity, input.maxActivePerTeam,
          input.active, input.adminNotes]
      );
      const component = created.rows[0];

      await transaction.query(
        `INSERT INTO checkout_inventory_transactions
          (component_id, admin_id, actor_user_id, transaction_type, quantity, new_state, note)
         VALUES ($1, $2, $2, 'INVENTORY_ADJUSTMENT', $3, $4, 'Component created')`,
        [component.id, actor.id, input.totalQuantity, JSON.stringify(componentView(component))]
      );
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, message)
         VALUES ($1, $2)`,
        [actor.id, `Added ${input.name} to inventory.`]
      );
      return componentView(component);
    }

    const currentResult = await transaction.query(
      "SELECT * FROM checkout_components WHERE id = $1 FOR UPDATE",
      [componentId]
    );
    const current = currentResult.rows[0];

    if (!current) {
      throw httpError(404, "Component not found.");
    }

    const allocated = Number(current.reserved_quantity) + Number(current.checked_out_quantity);

    if (input.totalQuantity < allocated + input.unavailableQuantity) {
      throw httpError(409, `Total inventory cannot be lower than the ${allocated} reserved/checked-out and ${input.unavailableQuantity} unavailable units.`);
    }

    const updatedResult = await transaction.query(
      `UPDATE checkout_components
          SET name = $2, description = $3, image_url = $4, category = $5,
              compatibility = $6, total_quantity = $7, unavailable_quantity = $8,
              max_active_per_team = $9, active = $10, admin_notes = $11, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [componentId, input.name, input.description, input.imageUrl, input.category,
        input.compatibility, input.totalQuantity, input.unavailableQuantity,
        input.maxActivePerTeam, input.active, input.adminNotes]
    );
    const updated = updatedResult.rows[0];

    await transaction.query(
      `INSERT INTO checkout_inventory_transactions
        (component_id, admin_id, actor_user_id, transaction_type, quantity, previous_state, new_state, note)
       VALUES ($1, $2, $2, 'INVENTORY_ADJUSTMENT', $3, $4, $5, 'Component updated')`,
      [componentId, actor.id, input.totalQuantity - Number(current.total_quantity),
        JSON.stringify(componentView(current)), JSON.stringify(componentView(updated))]
    );
    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, message)
       VALUES ($1, $2)`,
      [actor.id, `Updated inventory settings for ${input.name}.`]
    );
    return componentView(updated);
  });
}

async function submitOrder(database, body, actor) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const normalized = new Map();

  rawItems.forEach(function (item) {
    const componentId = positiveInteger(item.componentId, "Component ID");
    const quantity = positiveInteger(item.quantity, "Requested quantity");
    normalized.set(componentId, (normalized.get(componentId) || 0) + quantity);
  });

  if (!normalized.size) {
    throw httpError(400, "Add at least one component before submitting your order.");
  }

  return database.transaction(async function (transaction) {
    const cooldown = await transaction.query(
      `SELECT id, created_at,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (created_at + INTERVAL '10 minutes' - NOW())))) AS seconds_left
         FROM checkout_orders
        WHERE team_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [actor.team_id]
    );

    if (cooldown.rows[0] && Number(cooldown.rows[0].seconds_left) > 0) {
      throw httpError(429, `You can place another order in ${Math.ceil(Number(cooldown.rows[0].seconds_left) / 60)} minute(s).`, {
        cooldownSeconds: Number(cooldown.rows[0].seconds_left)
      });
    }

    const componentIds = Array.from(normalized.keys()).sort(function (a, b) { return a - b; });
    const componentsResult = await transaction.query(
      "SELECT * FROM checkout_components WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE",
      [componentIds]
    );
    const components = new Map(componentsResult.rows.map(function (component) {
      return [Number(component.id), component];
    }));
    const activeResult = await transaction.query(
      `SELECT components.id,
              COALESCE(inventory.checked_out_quantity, 0) +
              COALESCE(SUM(items.approved_quantity) FILTER (
                WHERE orders.status IN ('submitted', 'reviewing', 'ready')
              ), 0) AS active_quantity
         FROM checkout_components components
         LEFT JOIN checkout_team_inventory inventory
           ON inventory.component_id = components.id AND inventory.team_id = $1
         LEFT JOIN checkout_order_items items ON items.component_id = components.id
         LEFT JOIN checkout_orders orders ON orders.id = items.order_id AND orders.team_id = $1
        WHERE components.id = ANY($2::bigint[])
        GROUP BY components.id, inventory.checked_out_quantity`,
      [actor.team_id, componentIds]
    );
    const activeQuantities = new Map(activeResult.rows.map(function (row) {
      return [Number(row.id), Number(row.active_quantity)];
    }));
    const errors = [];

    componentIds.forEach(function (componentId) {
      const component = components.get(componentId);
      const requested = normalized.get(componentId);

      if (!component) {
        errors.push({ componentId, message: "This component no longer exists." });
        return;
      }

      if (!component.active) {
        errors.push({ componentId, message: `${component.name} is currently disabled.` });
        return;
      }

      const available = Number(component.total_quantity) - Number(component.reserved_quantity) -
        Number(component.checked_out_quantity) - Number(component.unavailable_quantity);

      if (requested > available) {
        errors.push({ componentId, message: `${component.name}: only ${available} currently available.` });
      }

      const limit = component.max_active_per_team == null ? null : Number(component.max_active_per_team);
      const active = activeQuantities.get(componentId) || 0;

      if (limit != null && active + requested > limit) {
        errors.push({ componentId, message: `${component.name}: you may request only ${Math.max(0, limit - active)} more (maximum ${limit} active).` });
      }
    });

    if (errors.length) {
      throw httpError(409, "Your order could not be reserved. Adjust the highlighted items and try again.", { items: errors });
    }

    const orderResult = await transaction.query(
      "INSERT INTO checkout_orders (team_id) VALUES ($1) RETURNING *",
      [actor.team_id]
    );
    const order = orderResult.rows[0];

    for (const componentId of componentIds) {
      const quantity = normalized.get(componentId);
      const component = components.get(componentId);

      await transaction.query(
        `INSERT INTO checkout_order_items
          (order_id, component_id, requested_quantity, approved_quantity)
         VALUES ($1, $2, $3, $3)`,
        [order.id, componentId, quantity]
      );
      await transaction.query(
        `UPDATE checkout_components
            SET reserved_quantity = reserved_quantity + $2, updated_at = NOW()
          WHERE id = $1`,
        [componentId, quantity]
      );
      await transaction.query(
        `INSERT INTO checkout_inventory_transactions
          (component_id, team_id, order_id, actor_user_id, transaction_type, quantity, note)
         VALUES ($1, $2, $3, $4, 'ORDER_RESERVED', $5, 'Reserved at order submission')`,
        [componentId, actor.team_id, order.id, actor.id, quantity]
      );
    }

    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
       VALUES ($1, $2, $3, $4)`,
      [actor.id, actor.team_id, order.id, `Team ${actor.team_name} submitted Order #${order.id}.`]
    );

    return orderDetails(transaction, order.id);
  });
}

async function orderDetails(database, orderId, teamId) {
  const values = [orderId];
  let teamClause = "";

  if (teamId != null) {
    values.push(teamId);
    teamClause = " AND orders.team_id = $2";
  }

  const result = await database.query(
    `SELECT orders.*, teams.name AS team_name, users.display_name AS reviewer_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
      WHERE orders.id = $1${teamClause}`,
    values
  );

  if (!result.rows[0]) {
    throw httpError(404, "Order not found.");
  }

  const items = await orderItems(database, [Number(orderId)]);
  return orderView(result.rows[0], items.get(Number(orderId)) || []);
}

async function teamDashboard(database, actor) {
  const ordersResult = await database.query(
    `SELECT orders.*, teams.name AS team_name, users.display_name AS reviewer_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
      WHERE orders.team_id = $1
      ORDER BY orders.created_at DESC`,
    [actor.team_id]
  );
  const ids = ordersResult.rows.map(function (order) { return Number(order.id); });
  const items = await orderItems(database, ids);
  const inventoryResult = await database.query(
    `SELECT inventory.checked_out_quantity, components.id, components.name,
            components.image_url, components.category
       FROM checkout_team_inventory inventory
       JOIN checkout_components components ON components.id = inventory.component_id
      WHERE inventory.team_id = $1 AND inventory.checked_out_quantity > 0
      ORDER BY components.name`,
    [actor.team_id]
  );
  const cooldownResult = await database.query(
    `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (created_at + INTERVAL '10 minutes' - NOW())))) AS seconds_left
       FROM checkout_orders WHERE team_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [actor.team_id]
  );

  return {
    orders: ordersResult.rows.map(function (order) {
      return orderView(order, items.get(Number(order.id)) || []);
    }),
    inventory: inventoryResult.rows.map(function (row) {
      return {
        componentId: Number(row.id),
        name: row.name,
        imageUrl: row.image_url,
        category: row.category,
        checkedOutQuantity: Number(row.checked_out_quantity)
      };
    }),
    cooldownSeconds: cooldownResult.rows[0] ? Number(cooldownResult.rows[0].seconds_left) : 0
  };
}

async function adminOrders(database) {
  const result = await database.query(
    `SELECT orders.*, teams.name AS team_name, users.display_name AS reviewer_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
      ORDER BY orders.created_at DESC`
  );
  const ids = result.rows.map(function (order) { return Number(order.id); });
  const items = await orderItems(database, ids);
  return result.rows.map(function (order) {
    return orderView(order, items.get(Number(order.id)) || []);
  });
}

async function adminOverview(database) {
  const orders = await database.query(
    "SELECT status, COUNT(*) AS count FROM checkout_orders GROUP BY status"
  );
  const inventory = await database.query(
    `SELECT COALESCE(SUM(total_quantity - reserved_quantity - checked_out_quantity - unavailable_quantity), 0) AS available,
            COALESCE(SUM(reserved_quantity), 0) AS reserved,
            COALESCE(SUM(checked_out_quantity), 0) AS checked_out,
            COALESCE(SUM(unavailable_quantity), 0) AS unavailable
       FROM checkout_components`
  );
  const teams = await database.query(
    "SELECT COUNT(DISTINCT team_id) AS count FROM checkout_team_inventory WHERE checked_out_quantity > 0"
  );

  return {
    orders: orders.rows.reduce(function (counts, row) {
      counts[row.status] = Number(row.count);
      return counts;
    }, {}),
    inventory: Object.fromEntries(Object.entries(inventory.rows[0]).map(function (entry) {
      return [entry[0], Number(entry[1])];
    })),
    teamsHoldingHardware: Number(teams.rows[0].count)
  };
}

async function claimOrder(database, body, actor) {
  const orderId = positiveInteger(body.orderId, "Order ID");

  return database.transaction(async function (transaction) {
    const result = await transaction.query(
      `SELECT orders.*, users.display_name AS reviewer_name
         FROM checkout_orders orders
         LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
        WHERE orders.id = $1 FOR UPDATE OF orders`,
      [orderId]
    );
    const order = result.rows[0];

    if (!order) {
      throw httpError(404, "Order not found.");
    }

    if (order.status === "reviewing" && Number(order.reviewed_by) === Number(actor.id)) {
      return orderDetails(transaction, orderId);
    }

    if (order.status !== "submitted") {
      const reviewer = order.reviewer_name ? ` by ${order.reviewer_name}` : "";
      throw httpError(409, `This order is already ${order.status.replace("_", " ")}${reviewer}.`);
    }

    await transaction.query(
      `UPDATE checkout_orders
          SET status = 'reviewing', reviewed_by = $2, reviewing_at = NOW()
        WHERE id = $1`,
      [orderId, actor.id]
    );
    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
       SELECT $2, team_id, id, $3 FROM checkout_orders WHERE id = $1`,
      [orderId, actor.id, `${actor.display_name} claimed Order #${orderId} for review.`]
    );
    return orderDetails(transaction, orderId);
  });
}

async function adjustOrder(database, body, actor) {
  const orderId = positiveInteger(body.orderId, "Order ID");
  const adjustments = Array.isArray(body.items) ? body.items : [];

  return database.transaction(async function (transaction) {
    const orderResult = await transaction.query(
      "SELECT * FROM checkout_orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    const order = orderResult.rows[0];

    if (!order) {
      throw httpError(404, "Order not found.");
    }

    if (order.status !== "reviewing" || Number(order.reviewed_by) !== Number(actor.id)) {
      throw httpError(409, "Claim this reviewing order before changing approved quantities.");
    }

    for (const adjustment of adjustments) {
      const itemId = positiveInteger(adjustment.itemId, "Order item ID");
      const approved = positiveInteger(adjustment.approvedQuantity, "Approved quantity", true);
      const itemResult = await transaction.query(
        `SELECT items.*, components.name
           FROM checkout_order_items items
           JOIN checkout_components components ON components.id = items.component_id
          WHERE items.id = $1 AND items.order_id = $2
          FOR UPDATE OF items`,
        [itemId, orderId]
      );
      const item = itemResult.rows[0];

      if (!item) {
        throw httpError(404, "Order item not found.");
      }

      if (approved > Number(item.requested_quantity)) {
        throw httpError(409, `${item.name}: approved quantity cannot exceed the requested quantity.`);
      }

      const previous = Number(item.approved_quantity);
      const released = previous - approved;
      const reason = cleanString(adjustment.reason, "Adjustment reason", { optional: approved === previous, max: 120 });
      const note = cleanString(adjustment.note, "Adjustment note", { optional: true, max: 1000 });

      await transaction.query(
        `UPDATE checkout_order_items
            SET approved_quantity = $2, adjustment_reason = $3, note = $4
          WHERE id = $1`,
        [itemId, approved, reason || null, note]
      );

      if (released !== 0) {
        await transaction.query(
          `UPDATE checkout_components
              SET reserved_quantity = reserved_quantity - $2, updated_at = NOW()
            WHERE id = $1`,
          [item.component_id, released]
        );
        await transaction.query(
          `INSERT INTO checkout_inventory_transactions
            (component_id, team_id, order_id, admin_id, actor_user_id, transaction_type, quantity, note)
           VALUES ($1, $2, $3, $4, $4, 'ORDER_ADJUSTED', $5, $6)`,
          [item.component_id, order.team_id, orderId, actor.id, -released, [reason, note].filter(Boolean).join(": ")]
        );
      }
    }

    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
       VALUES ($1, $2, $3, $4)`,
      [actor.id, order.team_id, orderId, `${actor.display_name} updated approved quantities for Order #${orderId}.`]
    );
    return orderDetails(transaction, orderId);
  });
}

async function transitionOrder(database, body, actor, transition) {
  const orderId = positiveInteger(body.orderId, "Order ID");

  return database.transaction(async function (transaction) {
    const orderResult = await transaction.query(
      "SELECT * FROM checkout_orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    const order = orderResult.rows[0];

    if (!order) {
      throw httpError(404, "Order not found.");
    }

    if (transition === "ready") {
      if (order.status === "ready") {
        return orderDetails(transaction, orderId);
      }

      if (order.status !== "reviewing" || Number(order.reviewed_by) !== Number(actor.id)) {
        throw httpError(409, "Only the volunteer reviewing this order can mark it ready.");
      }

      await transaction.query("UPDATE checkout_orders SET status = 'ready', ready_at = NOW() WHERE id = $1", [orderId]);
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
         VALUES ($1, $2, $3, $4)`,
        [actor.id, order.team_id, orderId, `${actor.display_name} marked Order #${orderId} ready for pickup.`]
      );
      return orderDetails(transaction, orderId);
    }

    if (transition === "pickup") {
      if (order.status === "picked_up") {
        return orderDetails(transaction, orderId);
      }

      if (order.status !== "ready") {
        throw httpError(409, "Only an order that is ready for pickup can be handed out.");
      }

      const items = await transaction.query(
        "SELECT * FROM checkout_order_items WHERE order_id = $1 ORDER BY component_id FOR UPDATE",
        [orderId]
      );

      for (const item of items.rows) {
        const quantity = Number(item.approved_quantity);

        if (!quantity) {
          continue;
        }

        const componentResult = await transaction.query(
          "SELECT * FROM checkout_components WHERE id = $1 FOR UPDATE",
          [item.component_id]
        );
        const component = componentResult.rows[0];

        if (Number(component.reserved_quantity) < quantity) {
          throw httpError(409, `Inventory state changed for ${component.name}; pickup was not processed.`);
        }

        await transaction.query(
          `UPDATE checkout_components
              SET reserved_quantity = reserved_quantity - $2,
                  checked_out_quantity = checked_out_quantity + $2,
                  updated_at = NOW()
            WHERE id = $1`,
          [item.component_id, quantity]
        );
        await transaction.query(
          `INSERT INTO checkout_team_inventory (team_id, component_id, checked_out_quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (team_id, component_id) DO UPDATE
             SET checked_out_quantity = checkout_team_inventory.checked_out_quantity + EXCLUDED.checked_out_quantity`,
          [order.team_id, item.component_id, quantity]
        );
        await transaction.query(
          `INSERT INTO checkout_inventory_transactions
            (component_id, team_id, order_id, admin_id, actor_user_id, transaction_type, quantity, idempotency_key, note)
           VALUES ($1, $2, $3, $4, $4, 'PICKUP', $5, $6, 'Physical pickup confirmed')`,
          [item.component_id, order.team_id, orderId, actor.id, quantity, `pickup:${orderId}:${item.component_id}`]
        );
      }

      await transaction.query(
        "UPDATE checkout_orders SET status = 'picked_up', picked_up_at = NOW() WHERE id = $1",
        [orderId]
      );
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
         VALUES ($1, $2, $3, $4)`,
        [actor.id, order.team_id, orderId, `${actor.display_name} confirmed pickup for Order #${orderId}.`]
      );
      return orderDetails(transaction, orderId);
    }

    if (transition === "cancel") {
      if (order.status === "cancelled") {
        return orderDetails(transaction, orderId);
      }

      if (order.status === "picked_up") {
        throw httpError(409, "Picked-up hardware must be processed as a return.");
      }

      const items = await transaction.query(
        "SELECT * FROM checkout_order_items WHERE order_id = $1 ORDER BY component_id FOR UPDATE",
        [orderId]
      );

      for (const item of items.rows) {
        const quantity = Number(item.approved_quantity);

        if (!quantity) {
          continue;
        }

        await transaction.query(
          `UPDATE checkout_components
              SET reserved_quantity = reserved_quantity - $2, updated_at = NOW()
            WHERE id = $1`,
          [item.component_id, quantity]
        );
        await transaction.query(
          `INSERT INTO checkout_inventory_transactions
            (component_id, team_id, order_id, admin_id, actor_user_id, transaction_type, quantity, idempotency_key, note)
           VALUES ($1, $2, $3, $4, $4, 'ORDER_CANCELLED', $5, $6, $7)`,
          [item.component_id, order.team_id, orderId, actor.id, -quantity,
            `cancel:${orderId}:${item.component_id}`, cleanString(body.note, "Cancellation note", { optional: true, max: 1000 })]
        );
      }

      await transaction.query(
        "UPDATE checkout_orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1",
        [orderId]
      );
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
         VALUES ($1, $2, $3, $4)`,
        [actor.id, order.team_id, orderId, `${actor.display_name} cancelled Order #${orderId}.`]
      );
      return orderDetails(transaction, orderId);
    }

    throw httpError(400, "Unknown order transition.");
  });
}

async function teamsList(database, search) {
  const query = cleanString(search, "Search", { optional: true, max: 120 });
  const result = await database.query(
    `SELECT teams.id, teams.name, teams.identifier, users.username,
            COALESCE(SUM(inventory.checked_out_quantity), 0) AS checked_out_quantity
       FROM checkout_teams teams
       JOIN checkout_users users ON users.team_id = teams.id AND users.role = 'team'
       LEFT JOIN checkout_team_inventory inventory ON inventory.team_id = teams.id
      WHERE $1 = '' OR teams.name ILIKE '%' || $1 || '%' OR teams.identifier ILIKE '%' || $1 || '%'
      GROUP BY teams.id, users.username
      ORDER BY teams.name`,
    [query]
  );

  return result.rows.map(function (row) {
    return {
      id: Number(row.id),
      name: row.name,
      identifier: row.identifier,
      username: row.username,
      checkedOutQuantity: Number(row.checked_out_quantity)
    };
  });
}

async function teamAdminDetail(database, teamIdInput) {
  const teamId = positiveInteger(teamIdInput, "Team ID");
  const teamResult = await database.query(
    "SELECT * FROM checkout_teams WHERE id = $1",
    [teamId]
  );

  if (!teamResult.rows[0]) {
    throw httpError(404, "Team not found.");
  }

  const inventory = await database.query(
    `SELECT inventory.checked_out_quantity, components.id, components.name,
            components.image_url, components.category
       FROM checkout_team_inventory inventory
       JOIN checkout_components components ON components.id = inventory.component_id
      WHERE inventory.team_id = $1 AND inventory.checked_out_quantity > 0
      ORDER BY components.name`,
    [teamId]
  );
  const ordersResult = await database.query(
    `SELECT orders.*, teams.name AS team_name, users.display_name AS reviewer_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
      WHERE orders.team_id = $1 ORDER BY orders.created_at DESC`,
    [teamId]
  );
  const orderIds = ordersResult.rows.map(function (row) { return Number(row.id); });
  const items = await orderItems(database, orderIds);
  const returns = await database.query(
    `SELECT receipts.id, receipts.created_at, users.display_name AS processed_by,
            items.component_id, items.quantity, items.condition, items.note, components.name
       FROM checkout_return_receipts receipts
       JOIN checkout_users users ON users.id = receipts.processed_by
       JOIN checkout_return_items items ON items.return_receipt_id = receipts.id
       JOIN checkout_components components ON components.id = items.component_id
      WHERE receipts.team_id = $1 ORDER BY receipts.created_at DESC, items.id`,
    [teamId]
  );
  const receiptMap = new Map();

  returns.rows.forEach(function (row) {
    const id = Number(row.id);

    if (!receiptMap.has(id)) {
      receiptMap.set(id, { id, createdAt: row.created_at, processedBy: row.processed_by, items: [] });
    }

    receiptMap.get(id).items.push({
      componentId: Number(row.component_id),
      name: row.name,
      quantity: Number(row.quantity),
      condition: row.condition,
      note: row.note
    });
  });

  return {
    team: {
      id: Number(teamResult.rows[0].id),
      name: teamResult.rows[0].name,
      identifier: teamResult.rows[0].identifier
    },
    inventory: inventory.rows.map(function (row) {
      return {
        componentId: Number(row.id),
        name: row.name,
        imageUrl: row.image_url,
        category: row.category,
        checkedOutQuantity: Number(row.checked_out_quantity)
      };
    }),
    orders: ordersResult.rows.map(function (order) {
      return orderView(order, items.get(Number(order.id)) || []);
    }),
    returns: Array.from(receiptMap.values())
  };
}

async function processReturn(database, body, actor) {
  const teamId = positiveInteger(body.teamId, "Team ID");
  const items = (Array.isArray(body.items) ? body.items : []).map(returnInput);

  if (!items.length) {
    throw httpError(400, "Enter at least one returned item.");
  }

  return database.transaction(async function (transaction) {
    const receiptResult = await transaction.query(
      `INSERT INTO checkout_return_receipts (team_id, processed_by)
       VALUES ($1, $2) RETURNING *`,
      [teamId, actor.id]
    );
    const receipt = receiptResult.rows[0];

    for (const item of items.sort(function (a, b) { return a.componentId - b.componentId; })) {
      const inventoryResult = await transaction.query(
        `SELECT inventory.checked_out_quantity, components.*
           FROM checkout_team_inventory inventory
           JOIN checkout_components components ON components.id = inventory.component_id
          WHERE inventory.team_id = $1 AND inventory.component_id = $2
          FOR UPDATE OF inventory, components`,
        [teamId, item.componentId]
      );
      const current = inventoryResult.rows[0];

      if (!current || Number(current.checked_out_quantity) < item.quantity) {
        const held = current ? Number(current.checked_out_quantity) : 0;
        const name = current ? current.name : `Component #${item.componentId}`;
        throw httpError(409, `${name}: this team holds ${held}, so returning ${item.quantity} is not possible.`);
      }

      await transaction.query(
        `UPDATE checkout_team_inventory
            SET checked_out_quantity = checked_out_quantity - $3
          WHERE team_id = $1 AND component_id = $2`,
        [teamId, item.componentId, item.quantity]
      );
      await transaction.query(
        `UPDATE checkout_components
            SET checked_out_quantity = checked_out_quantity - $2,
                unavailable_quantity = unavailable_quantity + $3,
                updated_at = NOW()
          WHERE id = $1`,
        [item.componentId, item.quantity, item.condition === "good" ? 0 : item.quantity]
      );
      await transaction.query(
        `INSERT INTO checkout_return_items
          (return_receipt_id, component_id, quantity, condition, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [receipt.id, item.componentId, item.quantity, item.condition, item.note]
      );
      const transactionType = item.condition === "good" ? "RETURN" : item.condition.toUpperCase();
      await transaction.query(
        `INSERT INTO checkout_inventory_transactions
          (component_id, team_id, admin_id, actor_user_id, transaction_type, quantity, idempotency_key, note)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7)`,
        [item.componentId, teamId, actor.id, transactionType, item.quantity,
          `return:${receipt.id}:${item.componentId}`, item.note]
      );
    }

    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, message)
       VALUES ($1, $2, $3)`,
      [actor.id, teamId, `${actor.display_name} processed Return #R-${receipt.id}.`]
    );
    return teamAdminDetail(transaction, teamId);
  });
}

async function activity(database) {
  const result = await database.query(
    `SELECT activity.*, users.display_name AS actor_name, teams.name AS team_name
       FROM checkout_activity activity
       LEFT JOIN checkout_users users ON users.id = activity.actor_user_id
       LEFT JOIN checkout_teams teams ON teams.id = activity.team_id
      ORDER BY activity.created_at DESC LIMIT 250`
  );

  return result.rows.map(function (row) {
    return {
      id: Number(row.id),
      actorName: row.actor_name,
      teamName: row.team_name,
      orderId: row.order_id == null ? null : Number(row.order_id),
      message: row.message,
      createdAt: row.created_at
    };
  });
}

module.exports = {
  catalog,
  createTeam,
  resetTeamPassword,
  saveComponent,
  submitOrder,
  orderDetails,
  teamDashboard,
  adminOrders,
  adminOverview,
  claimOrder,
  adjustOrder,
  transitionOrder,
  teamsList,
  teamAdminDetail,
  processReturn,
  activity
};
