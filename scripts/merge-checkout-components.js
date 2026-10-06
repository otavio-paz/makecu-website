const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");

const COMPONENT_MERGES = [
  {
    finalName: "Tactile Push Buttons (Assorted)",
    primaryName: "240 Pcs 24 Value Micro Momentary Tactile Switch Assortment Kit",
    memberNames: [
      "OCR 180Pcs Tactile Push Button Switch 10 Values 6x6mm Micro Momentary Tact Button Switches Assortment Kit",
      "240 Pcs 24 Value Micro Momentary Tactile Switch Assortment Kit",
      "Push Buttons",
      "Misc. Buttons"
    ],
    ignoredQuantityNames: ["Push Buttons"],
    expectedTotal: 440,
    maxActivePerTeam: 5,
    category: "Button",
    compatibility: "Arduino + Raspberry Pi",
    description: "Assorted 6×6 mm momentary tactile push buttons in multiple actuator heights for breadboard controls, reset inputs, and compact user interfaces.",
    imageAlt: "Product photo of assorted tactile push buttons",
    reason: "Combined the 180-piece and 240-piece tactile switch assortments with Misc. Buttons. The separate Push Buttons row reused the 240-piece kit link, so its package-level quantity was treated as a duplicate rather than an additional switch."
  },
  {
    finalName: "Ceramic Capacitors (Assorted)",
    primaryName: "Ceramic Capacitors",
    memberNames: ["Ceramic Capacitor", "Cermaic Capacitor", "Ceramic Capacitors"],
    expectedTotal: 270,
    maxActivePerTeam: 5,
    category: "Electronics",
    compatibility: "Arduino + Raspberry Pi",
    description: "Assorted non-polarized ceramic capacitors for decoupling, filtering, and timing circuits. Check the marked capacitance and voltage rating when selecting a part.",
    imageAlt: "Photo pending review for assorted ceramic capacitors",
    reason: "Combined the singular, misspelled, and kit ceramic-capacitor inventory rows."
  },
  {
    finalName: "Logitech Webcams",
    primaryName: "Logitech Webcams",
    memberNames: ["Logitech Webcam", "Logitech Webcams"],
    expectedTotal: 10,
    maxActivePerTeam: 2,
    category: "Camera",
    compatibility: "Raspberry Pi",
    description: "USB Logitech webcams for plug-and-play image and video capture on a Raspberry Pi or computer. Check the attached model and Linux support before relying on a specific resolution or frame rate.",
    imageAlt: "Photo pending review for Logitech webcams",
    reason: "Combined the singular and plural Logitech webcam inventory rows."
  },
  {
    finalName: "DC-DC Converters",
    primaryName: "12V DC-DC Converters",
    memberNames: ["12V DC-DC Converters", "DC-DC Converter"],
    expectedTotal: 7,
    maxActivePerTeam: 2,
    category: "Electronics",
    compatibility: "Arduino + Raspberry Pi",
    description: "Adjustable DC-DC converter modules for changing one DC voltage to another. Verify each module's input range, output setting, polarity, and current limit before connecting a load.",
    imageAlt: "Photo pending review for DC-DC converter modules",
    reason: "Combined the two DC-DC converter inventory rows."
  },
  {
    finalName: "Ultrasonic Sensors",
    primaryName: "Ultrasonic Sensor",
    memberNames: ["Ultrasonic Sensor", "Ultrasonic Distance Module"],
    expectedTotal: 9,
    maxActivePerTeam: 3,
    category: "Distance",
    compatibility: "Arduino + Raspberry Pi",
    description: "HC-SR04-style ultrasonic distance sensors for non-contact ranging, obstacle detection, and tank-level prototypes. Protect 3.3 V GPIO from a 5 V echo output when required.",
    imageAlt: "Product photo of an ultrasonic distance sensor module",
    reason: "Combined the Ultrasonic Sensor and Ultrasonic Distance Module inventory rows."
  }
];

function lower(value) {
  return value.toLocaleLowerCase("en-US");
}

function number(row, key) {
  return Number(row[key] || 0);
}

async function moveOrderItems(transaction, sourceIds, primaryId) {
  for (const sourceId of sourceIds) {
    const items = await transaction.query(
      `SELECT source.*, target.id AS target_item_id
         FROM checkout_order_items source
         LEFT JOIN checkout_order_items target
           ON target.order_id = source.order_id AND target.component_id = $2
        WHERE source.component_id = $1`,
      [sourceId, primaryId]
    );

    for (const item of items.rows) {
      if (item.target_item_id) {
        await transaction.query(
          `UPDATE checkout_order_items
              SET requested_quantity = requested_quantity + $2,
                  approved_quantity = approved_quantity + $3,
                  note = CASE WHEN note = '' THEN $4 WHEN $4 = '' THEN note ELSE note || ' | ' || $4 END
            WHERE id = $1`,
          [item.target_item_id, number(item, "requested_quantity"), number(item, "approved_quantity"), item.note || ""]
        );
        await transaction.query("DELETE FROM checkout_order_items WHERE id = $1", [item.id]);
      } else {
        await transaction.query("UPDATE checkout_order_items SET component_id = $2 WHERE id = $1", [item.id, primaryId]);
      }
    }
  }
}

async function moveTeamInventory(transaction, sourceIds, primaryId) {
  for (const sourceId of sourceIds) {
    const rows = await transaction.query(
      "SELECT team_id, checked_out_quantity FROM checkout_team_inventory WHERE component_id = $1",
      [sourceId]
    );

    for (const row of rows.rows) {
      await transaction.query(
        `INSERT INTO checkout_team_inventory (team_id, component_id, checked_out_quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, component_id) DO UPDATE
           SET checked_out_quantity = checkout_team_inventory.checked_out_quantity + EXCLUDED.checked_out_quantity`,
        [row.team_id, primaryId, number(row, "checked_out_quantity")]
      );
    }
    await transaction.query("DELETE FROM checkout_team_inventory WHERE component_id = $1", [sourceId]);
  }
}

async function moveRelationships(transaction, componentIds, primaryId) {
  const result = await transaction.query(
    `SELECT source_component_id, target_component_id, relation_type, quantity_ratio, minimum_source_quantity, message
       FROM checkout_component_relationships
      WHERE source_component_id = ANY($1::bigint[]) OR target_component_id = ANY($1::bigint[])`,
    [componentIds]
  );
  await transaction.query(
    "DELETE FROM checkout_component_relationships WHERE source_component_id = ANY($1::bigint[]) OR target_component_id = ANY($1::bigint[])",
    [componentIds]
  );

  for (const relationship of result.rows) {
    const sourceId = componentIds.includes(Number(relationship.source_component_id)) ? primaryId : Number(relationship.source_component_id);
    const targetId = componentIds.includes(Number(relationship.target_component_id)) ? primaryId : Number(relationship.target_component_id);
    if (sourceId === targetId) continue;

    await transaction.query(
      `INSERT INTO checkout_component_relationships
        (source_component_id, target_component_id, relation_type, quantity_ratio, minimum_source_quantity, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_component_id, target_component_id, relation_type) DO NOTHING`,
      [sourceId, targetId, relationship.relation_type, relationship.quantity_ratio,
        relationship.minimum_source_quantity, relationship.message]
    );
  }
}

async function mergeDefinition(transaction, definition, actor) {
  const lookupNames = [...definition.memberNames, definition.finalName].map(lower);
  const result = await transaction.query(
    "SELECT * FROM checkout_components WHERE LOWER(name) = ANY($1::text[]) ORDER BY id FOR UPDATE",
    [lookupNames]
  );
  const rows = result.rows;

  if (rows.length === 1 && lower(rows[0].name) === lower(definition.finalName)) {
    return { status: "unchanged", name: definition.finalName, totalQuantity: number(rows[0], "total_quantity") };
  }
  if (rows.length < 2) {
    return { status: "missing", name: definition.finalName, found: rows.map(function (row) { return row.name; }) };
  }

  const primary = rows.find(function (row) { return lower(row.name) === lower(definition.finalName); }) ||
    rows.find(function (row) { return lower(row.name) === lower(definition.primaryName); });
  if (!primary) {
    throw new Error(`Could not find the primary component for ${definition.finalName}.`);
  }

  const ignoredNames = new Set((definition.ignoredQuantityNames || []).map(lower));
  const ignoredRows = rows.filter(function (row) { return ignoredNames.has(lower(row.name)); });
  ignoredRows.forEach(function (row) {
    const allocated = number(row, "reserved_quantity") + number(row, "checked_out_quantity") +
      number(row, "unavailable_quantity") + number(row, "protected_stock");
    if (allocated !== 0) {
      throw new Error(`${row.name} has allocated or protected inventory and cannot be discarded as a duplicate.`);
    }
  });

  const includedRows = rows.filter(function (row) { return !ignoredNames.has(lower(row.name)); });
  const totals = {
    total: includedRows.reduce(function (sum, row) { return sum + number(row, "total_quantity"); }, 0),
    reserved: includedRows.reduce(function (sum, row) { return sum + number(row, "reserved_quantity"); }, 0),
    checkedOut: includedRows.reduce(function (sum, row) { return sum + number(row, "checked_out_quantity"); }, 0),
    unavailable: includedRows.reduce(function (sum, row) { return sum + number(row, "unavailable_quantity"); }, 0),
    protectedStock: includedRows.reduce(function (sum, row) { return sum + number(row, "protected_stock"); }, 0)
  };
  if (totals.total !== definition.expectedTotal) {
    throw new Error(`${definition.finalName} would total ${totals.total}; expected ${definition.expectedTotal}. Review the source quantities before merging.`);
  }

  const componentIds = rows.map(function (row) { return Number(row.id); });
  const primaryId = Number(primary.id);
  const sourceIds = componentIds.filter(function (id) { return id !== primaryId; });
  await moveOrderItems(transaction, sourceIds, primaryId);
  await moveTeamInventory(transaction, sourceIds, primaryId);
  await moveRelationships(transaction, componentIds, primaryId);
  await transaction.query("UPDATE checkout_return_items SET component_id = $1 WHERE component_id = ANY($2::bigint[])", [primaryId, sourceIds]);
  await transaction.query("UPDATE checkout_return_correction_items SET component_id = $1 WHERE component_id = ANY($2::bigint[])", [primaryId, sourceIds]);
  await transaction.query("UPDATE checkout_inventory_transactions SET component_id = $1 WHERE component_id = ANY($2::bigint[])", [primaryId, sourceIds]);

  const updated = await transaction.query(
    `UPDATE checkout_components
        SET name = $2, description = $3, image_alt = $4, category = $5, compatibility = $6,
            total_quantity = $7, reserved_quantity = $8, checked_out_quantity = $9,
            unavailable_quantity = $10, protected_stock = $11, max_active_per_team = $12,
            active = TRUE, version = version + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [primaryId, definition.finalName, definition.description, definition.imageAlt,
      definition.category, definition.compatibility, totals.total, totals.reserved,
      totals.checkedOut, totals.unavailable, totals.protectedStock, definition.maxActivePerTeam]
  );
  await transaction.query("DELETE FROM checkout_components WHERE id = ANY($1::bigint[])", [sourceIds]);
  await transaction.query(
    `INSERT INTO checkout_inventory_transactions
      (component_id, admin_id, actor_user_id, transaction_type, quantity, previous_state, new_state, note)
     VALUES ($1, $2, $2, 'INVENTORY_ADJUSTMENT', $3, $4, $5, $6)`,
    [primaryId, actor.id, totals.total - number(primary, "total_quantity"), JSON.stringify(rows),
      JSON.stringify(updated.rows[0]), definition.reason]
  );
  await transaction.query(
    "INSERT INTO checkout_activity (actor_user_id, message) VALUES ($1, $2)",
    [actor.id, `Combined inventory into ${definition.finalName}.`]
  );

  return {
    status: "merged",
    name: definition.finalName,
    totalQuantity: totals.total,
    protectedStock: totals.protectedStock,
    removed: rows.filter(function (row) { return Number(row.id) !== primaryId; }).map(function (row) { return row.name; })
  };
}

async function applyComponentMerges(database) {
  return database.transaction(async function (transaction) {
    const actorResult = await transaction.query(
      "SELECT id, username, role, display_name FROM checkout_users WHERE role = 'admin' AND active = TRUE ORDER BY id LIMIT 1"
    );
    const actor = actorResult.rows[0];
    if (!actor) throw new Error("Seed an active admin before merging components.");

    const results = [];
    for (const definition of COMPONENT_MERGES) {
      results.push(await mergeDefinition(transaction, definition, actor));
    }
    return results;
  });
}

async function main() {
  const database = await getDatabase();
  const result = await applyComponentMerges(database);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await resetDatabaseForTests();
}

if (require.main === module) {
  main().catch(async function (error) {
    console.error(error);
    await resetDatabaseForTests().catch(function () {});
    process.exitCode = 1;
  });
}

module.exports = { COMPONENT_MERGES, applyComponentMerges };
