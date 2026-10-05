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
    imageAlt: row.image_alt,
    category: row.category,
    compatibility: row.compatibility,
    binLocation: row.bin_location,
    technicalSpecs: row.technical_specs,
    totalQuantity: total,
    reservedQuantity: reserved,
    checkedOutQuantity: checkedOut,
    unavailableQuantity: unavailable,
    availableQuantity: total - reserved - checkedOut - unavailable,
    teamAvailableQuantity: Math.max(0, total - reserved - checkedOut - unavailable - Number(row.protected_stock || 0)),
    protectedStock: Number(row.protected_stock || 0),
    maxActivePerTeam: row.max_active_per_team == null ? null : Number(row.max_active_per_team),
    teamActiveQuantity: Number(row.team_active_quantity || 0),
    active: row.active,
    adminNotes: row.admin_notes,
    version: Number(row.version || 1),
    updatedAt: row.updated_at
  };
}

function orderView(row, items) {
  return {
    id: Number(row.id),
    receiptCode: row.receipt_code || `O-${String(row.id).padStart(5, "0")}`,
    teamId: Number(row.team_id),
    teamName: row.team_name,
    status: row.status,
    reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
    reviewingAt: row.reviewing_at,
    claimExpiresAt: row.claim_expires_at,
    acceptedAt: row.accepted_at,
    acceptedBy: row.accepted_by == null ? null : Number(row.accepted_by),
    acceptedByName: row.accepted_by_name,
    readyAt: row.ready_at,
    readyByName: row.ready_by_name,
    pickedUpAt: row.picked_up_at,
    pickedUpByName: row.picked_up_by_name,
    cancelledAt: row.cancelled_at,
    cancelledByName: row.cancelled_by_name,
    cancellationNote: row.cancellation_note,
    expiredAt: row.expired_at,
    reservationExpiresAt: row.reservation_expires_at,
    events: row.events || [],
    items: items || []
  };
}

function itemView(row) {
  return {
    id: Number(row.id),
    componentId: Number(row.component_id),
    name: row.component_name_snapshot || row.name,
    imageUrl: row.component_image_url_snapshot || row.image_url,
    imageAlt: row.component_image_alt_snapshot || row.image_alt,
    category: row.component_category_snapshot || row.category,
    binLocation: row.bin_location || "",
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
    `SELECT items.*, components.name, components.image_url, components.image_alt,
            components.category, components.bin_location
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

async function recordOrderEvent(database, orderId, actorId, eventType, details) {
  await database.query(
    `INSERT INTO checkout_order_events (order_id, actor_user_id, event_type, details)
     VALUES ($1, $2, $3, $4)`,
    [orderId, actorId || null, eventType, JSON.stringify(details || {})]
  );
}

async function expireOrders(database) {
  return database.transaction(async function (transaction) {
    const result = await transaction.query(
      `SELECT * FROM checkout_orders
        WHERE status IN ('submitted', 'reviewing', 'accepted', 'ready')
          AND reservation_expires_at IS NOT NULL
          AND reservation_expires_at <= NOW()
          AND (status <> 'reviewing' OR claim_expires_at IS NULL OR claim_expires_at <= NOW())
        ORDER BY id
        FOR UPDATE SKIP LOCKED`
    );

    for (const order of result.rows) {
      const items = await transaction.query(
        "SELECT * FROM checkout_order_items WHERE order_id = $1 ORDER BY component_id FOR UPDATE",
        [order.id]
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
            (component_id, team_id, order_id, transaction_type, quantity, note)
           VALUES ($1, $2, $3, 'ORDER_EXPIRED', $4, 'Reservation expired automatically')`,
          [item.component_id, order.team_id, order.id, -quantity]
        );
      }

      await transaction.query(
        `UPDATE checkout_orders
            SET status = 'expired', expired_at = NOW(), claim_expires_at = NULL
          WHERE id = $1`,
        [order.id]
      );
      await recordOrderEvent(transaction, order.id, null, "ORDER_EXPIRED", {});
      await transaction.query(
        `INSERT INTO checkout_activity (team_id, order_id, message)
         VALUES ($1, $2, $3)`,
        [order.team_id, order.id, `Order ${order.receipt_code || `#${order.id}`} expired and its reservation was released.`]
      );
    }

    return result.rowCount;
  });
}

async function catalog(database, user, includeInactive) {
  await expireOrders(database);
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
            AND orders.status IN ('submitted', 'reviewing', 'accepted', 'ready')
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
  const changeReason = cleanString(body.changeReason, "Inventory change reason", { optional: !componentId, max: 500 });

  return database.transaction(async function (transaction) {
    if (!componentId) {
      if (input.unavailableQuantity + input.protectedStock > input.totalQuantity) {
        throw httpError(409, "Unavailable quantity and protected stock cannot exceed total inventory.");
      }

      const created = await transaction.query(
        `INSERT INTO checkout_components
          (name, description, image_url, image_alt, category, compatibility, bin_location,
           technical_specs, total_quantity, unavailable_quantity, protected_stock,
           max_active_per_team, active, admin_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [input.name, input.description, input.imageUrl, input.imageAlt, input.category,
          input.compatibility, input.binLocation, input.technicalSpecs, input.totalQuantity,
          input.unavailableQuantity, input.protectedStock, input.maxActivePerTeam,
          input.active, input.adminNotes]
      );
      const component = created.rows[0];

      await transaction.query(
        `INSERT INTO checkout_inventory_transactions
          (component_id, admin_id, actor_user_id, transaction_type, quantity, new_state, note)
         VALUES ($1, $2, $2, 'INVENTORY_ADJUSTMENT', $3, $4, $5)`,
        [component.id, actor.id, input.totalQuantity, JSON.stringify(componentView(component)), changeReason || "Component created"]
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

    const expectedVersion = positiveInteger(body.expectedVersion, "Expected component version");

    if (Number(current.version) !== expectedVersion) {
      throw httpError(409, "This component changed since you opened it. Review the latest values before saving.", {
        current: componentView(current)
      });
    }

    const allocated = Number(current.reserved_quantity) + Number(current.checked_out_quantity);

    if (input.totalQuantity < allocated + input.unavailableQuantity) {
      throw httpError(409, `Total inventory cannot be lower than the ${allocated} reserved/checked-out and ${input.unavailableQuantity} unavailable units.`);
    }

    if (input.protectedStock > input.totalQuantity - input.unavailableQuantity) {
      throw httpError(409, "Protected stock cannot exceed usable inventory.");
    }

    const updatedResult = await transaction.query(
      `UPDATE checkout_components
          SET name = $2, description = $3, image_url = $4, image_alt = $5, category = $6,
              compatibility = $7, bin_location = $8, technical_specs = $9,
              total_quantity = $10, unavailable_quantity = $11, protected_stock = $12,
              max_active_per_team = $13, active = $14, admin_notes = $15,
              version = version + 1, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [componentId, input.name, input.description, input.imageUrl, input.imageAlt, input.category,
        input.compatibility, input.binLocation, input.technicalSpecs, input.totalQuantity,
        input.unavailableQuantity, input.protectedStock, input.maxActivePerTeam,
        input.active, input.adminNotes]
    );
    const updated = updatedResult.rows[0];

    await transaction.query(
      `INSERT INTO checkout_inventory_transactions
        (component_id, admin_id, actor_user_id, transaction_type, quantity, previous_state, new_state, note)
       VALUES ($1, $2, $2, 'INVENTORY_ADJUSTMENT', $3, $4, $5, $6)`,
      [componentId, actor.id, input.totalQuantity - Number(current.total_quantity),
        JSON.stringify(componentView(current)), JSON.stringify(componentView(updated)), changeReason]
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
    const teamLock = await transaction.query(
      "SELECT id FROM checkout_teams WHERE id = $1 FOR UPDATE",
      [actor.team_id]
    );

    if (!teamLock.rows[0]) {
      throw httpError(404, "Team not found.");
    }

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
                WHERE orders.status IN ('submitted', 'reviewing', 'accepted', 'ready')
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

      const available = Math.max(0, Number(component.total_quantity) - Number(component.reserved_quantity) -
        Number(component.checked_out_quantity) - Number(component.unavailable_quantity) - Number(component.protected_stock || 0));

      if (requested > available) {
        errors.push({ componentId, message: `${component.name}: only ${available} currently available for team orders.` });
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
      `INSERT INTO checkout_orders (team_id, reservation_expires_at)
       VALUES ($1, NOW() + INTERVAL '30 minutes') RETURNING *`,
      [actor.team_id]
    );
    const order = orderResult.rows[0];
    const receiptCode = `O-${String(order.id).padStart(5, "0")}`;

    await transaction.query(
      "UPDATE checkout_orders SET receipt_code = $2 WHERE id = $1",
      [order.id, receiptCode]
    );

    for (const componentId of componentIds) {
      const quantity = normalized.get(componentId);
      const component = components.get(componentId);

      await transaction.query(
        `INSERT INTO checkout_order_items
          (order_id, component_id, requested_quantity, approved_quantity,
           component_name_snapshot, component_image_url_snapshot,
           component_image_alt_snapshot, component_category_snapshot)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7)`,
        [order.id, componentId, quantity, component.name, component.image_url,
          component.image_alt, component.category]
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
      [actor.id, actor.team_id, order.id, `Team ${actor.team_name} submitted ${receiptCode}.`]
    );
    await recordOrderEvent(transaction, order.id, actor.id, "ORDER_SUBMITTED", {
      reservationExpiresAt: order.reservation_expires_at
    });

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
    `SELECT orders.*, teams.name AS team_name, reviewer.display_name AS reviewer_name,
            accepted.display_name AS accepted_by_name, ready.display_name AS ready_by_name,
            picked_up.display_name AS picked_up_by_name, cancelled.display_name AS cancelled_by_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users reviewer ON reviewer.id = orders.reviewed_by
       LEFT JOIN checkout_users accepted ON accepted.id = orders.accepted_by
       LEFT JOIN checkout_users ready ON ready.id = orders.ready_by
       LEFT JOIN checkout_users picked_up ON picked_up.id = orders.picked_up_by
       LEFT JOIN checkout_users cancelled ON cancelled.id = orders.cancelled_by
      WHERE orders.id = $1${teamClause}`,
    values
  );

  if (!result.rows[0]) {
    throw httpError(404, "Order not found.");
  }

  const items = await orderItems(database, [Number(orderId)]);
  const eventsResult = await database.query(
    `SELECT events.event_type, events.details, events.created_at, users.display_name AS actor_name
       FROM checkout_order_events events
       LEFT JOIN checkout_users users ON users.id = events.actor_user_id
      WHERE events.order_id = $1 ORDER BY events.created_at, events.id`,
    [orderId]
  );
  const row = result.rows[0];
  row.events = eventsResult.rows.map(function (event) {
    return {
      type: event.event_type,
      details: event.details || {},
      createdAt: event.created_at,
      actorName: event.actor_name
    };
  });
  return orderView(row, items.get(Number(orderId)) || []);
}

async function teamDashboard(database, actor) {
  await expireOrders(database);
  const ordersResult = await database.query(
    `SELECT orders.*, teams.name AS team_name, reviewer.display_name AS reviewer_name,
            accepted.display_name AS accepted_by_name, ready.display_name AS ready_by_name,
            picked_up.display_name AS picked_up_by_name, cancelled.display_name AS cancelled_by_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users reviewer ON reviewer.id = orders.reviewed_by
       LEFT JOIN checkout_users accepted ON accepted.id = orders.accepted_by
       LEFT JOIN checkout_users ready ON ready.id = orders.ready_by
       LEFT JOIN checkout_users picked_up ON picked_up.id = orders.picked_up_by
       LEFT JOIN checkout_users cancelled ON cancelled.id = orders.cancelled_by
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
  await expireOrders(database);
  const result = await database.query(
    `SELECT orders.*, teams.name AS team_name, reviewer.display_name AS reviewer_name,
            accepted.display_name AS accepted_by_name, ready.display_name AS ready_by_name,
            picked_up.display_name AS picked_up_by_name, cancelled.display_name AS cancelled_by_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users reviewer ON reviewer.id = orders.reviewed_by
       LEFT JOIN checkout_users accepted ON accepted.id = orders.accepted_by
       LEFT JOIN checkout_users ready ON ready.id = orders.ready_by
       LEFT JOIN checkout_users picked_up ON picked_up.id = orders.picked_up_by
       LEFT JOIN checkout_users cancelled ON cancelled.id = orders.cancelled_by
      ORDER BY orders.created_at DESC`
  );
  const ids = result.rows.map(function (order) { return Number(order.id); });
  const items = await orderItems(database, ids);
  return result.rows.map(function (order) {
    return orderView(order, items.get(Number(order.id)) || []);
  });
}

async function adminOverview(database) {
  await expireOrders(database);
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
      `SELECT orders.*, users.display_name AS reviewer_name,
              (orders.claim_expires_at IS NOT NULL AND orders.claim_expires_at <= NOW()) AS claim_expired
         FROM checkout_orders orders
         LEFT JOIN checkout_users users ON users.id = orders.reviewed_by
        WHERE orders.id = $1 FOR UPDATE OF orders`,
      [orderId]
    );
    const order = result.rows[0];

    if (!order) {
      throw httpError(404, "Order not found.");
    }

    if (order.status === "reviewing" && Number(order.reviewed_by) === Number(actor.id) && !order.claim_expired) {
      await transaction.query(
        "UPDATE checkout_orders SET claim_expires_at = NOW() + INTERVAL '7 minutes' WHERE id = $1",
        [orderId]
      );
      return orderDetails(transaction, orderId);
    }

    const canTakeExpiredClaim = order.status === "reviewing" && order.claim_expired;

    if (order.status !== "submitted" && !canTakeExpiredClaim) {
      const reviewer = order.reviewer_name ? ` by ${order.reviewer_name}` : "";
      throw httpError(409, `This order is already ${order.status.replace("_", " ")}${reviewer}.`);
    }

    await transaction.query(
      `UPDATE checkout_orders
          SET status = 'reviewing', reviewed_by = $2, reviewing_at = NOW(),
              claim_expires_at = NOW() + INTERVAL '7 minutes'
        WHERE id = $1`,
      [orderId, actor.id]
    );
    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
       SELECT $2, team_id, id, $3 FROM checkout_orders WHERE id = $1`,
      [orderId, actor.id, `${actor.display_name} ${canTakeExpiredClaim ? "took over the expired claim on" : "claimed"} Order #${orderId} for review.`]
    );
    await recordOrderEvent(transaction, orderId, actor.id, canTakeExpiredClaim ? "ORDER_CLAIM_TAKEN_OVER" : "ORDER_CLAIMED", {});
    return orderDetails(transaction, orderId);
  });
}

async function releaseClaim(database, body, actor) {
  const orderId = positiveInteger(body.orderId, "Order ID");

  return database.transaction(async function (transaction) {
    const result = await transaction.query(
      "SELECT * FROM checkout_orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    const order = result.rows[0];

    if (!order) {
      throw httpError(404, "Order not found.");
    }

    if (order.status !== "reviewing" || Number(order.reviewed_by) !== Number(actor.id)) {
      throw httpError(409, "Only the volunteer holding this claim can release it.");
    }

    await transaction.query(
      `UPDATE checkout_orders
          SET status = 'submitted', reviewed_by = NULL, reviewing_at = NULL,
              claim_expires_at = NULL,
              reservation_expires_at = GREATEST(reservation_expires_at, NOW() + INTERVAL '20 minutes')
        WHERE id = $1`,
      [orderId]
    );
    await recordOrderEvent(transaction, orderId, actor.id, "ORDER_CLAIM_RELEASED", {});
    await transaction.query(
      `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
       VALUES ($1, $2, $3, $4)`,
      [actor.id, order.team_id, orderId, `${actor.display_name} released the claim on Order #${orderId}.`]
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

    if (order.status !== "reviewing" || Number(order.reviewed_by) !== Number(actor.id) ||
        !order.claim_expires_at || new Date(order.claim_expires_at) <= new Date()) {
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

      if (approved > previous) {
        throw httpError(409, `${item.name}: approved quantity can only be lowered after reservation. Ask the team to place a later order for additional units.`);
      }

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
    await transaction.query(
      "UPDATE checkout_orders SET claim_expires_at = NOW() + INTERVAL '7 minutes' WHERE id = $1",
      [orderId]
    );
    await recordOrderEvent(transaction, orderId, actor.id, "ORDER_ADJUSTED", {});
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

    if (transition === "accept") {
      if (order.status === "accepted") {
        return orderDetails(transaction, orderId);
      }

      if (order.status !== "reviewing" || Number(order.reviewed_by) !== Number(actor.id) ||
          !order.claim_expires_at || new Date(order.claim_expires_at) <= new Date()) {
        throw httpError(409, "Only the volunteer with the active claim can accept this order.");
      }

      await transaction.query(
        `UPDATE checkout_orders
            SET status = 'accepted', accepted_by = $2, accepted_at = NOW(),
                claim_expires_at = NULL, reservation_expires_at = NOW() + INTERVAL '45 minutes'
          WHERE id = $1`,
        [orderId, actor.id]
      );
      await recordOrderEvent(transaction, orderId, actor.id, "ORDER_ACCEPTED", {});
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, team_id, order_id, message)
         VALUES ($1, $2, $3, $4)`,
        [actor.id, order.team_id, orderId, `${actor.display_name} accepted Order #${orderId}.`]
      );
      return orderDetails(transaction, orderId);
    }

    if (transition === "ready") {
      if (order.status === "ready") {
        return orderDetails(transaction, orderId);
      }

      if (order.status !== "accepted" || Number(order.accepted_by) !== Number(actor.id)) {
        throw httpError(409, "Only the volunteer who accepted this order can mark it ready.");
      }

      await transaction.query(
        `UPDATE checkout_orders
            SET status = 'ready', ready_by = $2, ready_at = NOW(),
                reservation_expires_at = NOW() + INTERVAL '30 minutes'
          WHERE id = $1`,
        [orderId, actor.id]
      );
      await recordOrderEvent(transaction, orderId, actor.id, "ORDER_READY", {});
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
        `UPDATE checkout_orders
            SET status = 'picked_up', picked_up_by = $2, picked_up_at = NOW(),
                reservation_expires_at = NULL
          WHERE id = $1`,
        [orderId, actor.id]
      );
      await recordOrderEvent(transaction, orderId, actor.id, "ORDER_PICKED_UP", {});
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
        `UPDATE checkout_orders
            SET status = 'cancelled', cancelled_by = $2, cancelled_at = NOW(),
                claim_expires_at = NULL, reservation_expires_at = NULL, cancellation_note = $3
          WHERE id = $1`,
        [orderId, actor.id, cleanString(body.note, "Cancellation note", { optional: true, max: 1000 })]
      );
      await recordOrderEvent(transaction, orderId, actor.id, "ORDER_CANCELLED", {
        note: cleanString(body.note, "Cancellation note", { optional: true, max: 1000 })
      });
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
  await expireOrders(database);
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
    `SELECT orders.*, teams.name AS team_name, reviewer.display_name AS reviewer_name,
            accepted.display_name AS accepted_by_name, ready.display_name AS ready_by_name,
            picked_up.display_name AS picked_up_by_name, cancelled.display_name AS cancelled_by_name
       FROM checkout_orders orders
       JOIN checkout_teams teams ON teams.id = orders.team_id
       LEFT JOIN checkout_users reviewer ON reviewer.id = orders.reviewed_by
       LEFT JOIN checkout_users accepted ON accepted.id = orders.accepted_by
       LEFT JOIN checkout_users ready ON ready.id = orders.ready_by
       LEFT JOIN checkout_users picked_up ON picked_up.id = orders.picked_up_by
       LEFT JOIN checkout_users cancelled ON cancelled.id = orders.cancelled_by
      WHERE orders.team_id = $1 ORDER BY orders.created_at DESC`,
    [teamId]
  );
  const orderIds = ordersResult.rows.map(function (row) { return Number(row.id); });
  const items = await orderItems(database, orderIds);
  const returns = await database.query(
    `SELECT receipts.id, receipts.receipt_code, receipts.created_at, users.display_name AS processed_by,
            items.component_id, items.quantity, items.condition, items.note,
            COALESCE(NULLIF(items.component_name_snapshot, ''), components.name) AS name
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
      receiptMap.set(id, {
        id,
        receiptCode: row.receipt_code || `R-${String(id).padStart(5, "0")}`,
        createdAt: row.created_at,
        processedBy: row.processed_by,
        items: []
      });
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
    const receiptCode = `R-${String(receipt.id).padStart(5, "0")}`;

    await transaction.query(
      "UPDATE checkout_return_receipts SET receipt_code = $2 WHERE id = $1",
      [receipt.id, receiptCode]
    );

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
          (return_receipt_id, component_id, quantity, condition, note, component_name_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [receipt.id, item.componentId, item.quantity, item.condition, item.note, current.name]
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
      [actor.id, teamId, `${actor.display_name} processed ${receiptCode}.`]
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
  releaseClaim,
  adjustOrder,
  transitionOrder,
  teamsList,
  teamAdminDetail,
  processReturn,
  activity
};
