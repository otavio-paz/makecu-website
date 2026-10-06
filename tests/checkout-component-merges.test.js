const test = require("node:test");
const assert = require("node:assert/strict");

process.env.CHECKOUT_PGLITE_PATH = "memory://";
process.env.CHECKOUT_FORCE_LIVE = "true";

const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { COMPONENT_MERGES, applyComponentMerges } = require("../scripts/merge-checkout-components");

test("approved duplicate components merge without losing quantities or active references", async function () {
  const database = await getDatabase();
  await database.query(
    `INSERT INTO checkout_users (username, password_hash, role, display_name)
     VALUES ('merge-auditor', 'not-used-in-this-test', 'admin', 'Merge Auditor')`
  );
  await database.query("INSERT INTO checkout_teams (name, identifier) VALUES ('Merge Team', 'merge-team')");
  const team = (await database.query("SELECT id FROM checkout_teams WHERE identifier = 'merge-team'")).rows[0];

  for (const definition of COMPONENT_MERGES) {
    const quantityByName = new Map();
    if (definition.finalName === "Tactile Push Buttons (Assorted)") {
      quantityByName.set(definition.memberNames[0], 180);
      quantityByName.set(definition.memberNames[1], 240);
      quantityByName.set(definition.memberNames[2], 1);
      quantityByName.set(definition.memberNames[3], 20);
    } else if (definition.finalName === "Ceramic Capacitors (Assorted)") {
      quantityByName.set(definition.memberNames[0], 10);
      quantityByName.set(definition.memberNames[1], 20);
      quantityByName.set(definition.memberNames[2], 240);
    } else if (definition.finalName === "Logitech Webcams") {
      quantityByName.set(definition.memberNames[0], 2);
      quantityByName.set(definition.memberNames[1], 8);
    } else if (definition.finalName === "DC-DC Converters") {
      quantityByName.set(definition.memberNames[0], 5);
      quantityByName.set(definition.memberNames[1], 2);
    } else {
      quantityByName.set(definition.memberNames[0], 6);
      quantityByName.set(definition.memberNames[1], 3);
    }

    for (const [name, quantity] of quantityByName) {
      await database.query(
        `INSERT INTO checkout_components
          (name, description, image_url, image_alt, category, compatibility, total_quantity, max_active_per_team, active)
         VALUES ($1, '', '/test.jpg', 'Test image', $2, $3, $4, 1, TRUE)`,
        [name, definition.category, definition.compatibility, quantity]
      );
    }
  }

  const webcamSource = (await database.query("SELECT id FROM checkout_components WHERE name = 'Logitech Webcam'")).rows[0];
  await database.query("UPDATE checkout_components SET checked_out_quantity = 1 WHERE id = $1", [webcamSource.id]);
  await database.query(
    "INSERT INTO checkout_team_inventory (team_id, component_id, checked_out_quantity) VALUES ($1, $2, 1)",
    [team.id, webcamSource.id]
  );

  const first = await applyComponentMerges(database);
  assert.equal(first.filter(function (item) { return item.status === "merged"; }).length, COMPONENT_MERGES.length);

  const stored = await database.query(
    "SELECT id, name, total_quantity, checked_out_quantity, protected_stock FROM checkout_components ORDER BY name"
  );
  assert.equal(stored.rows.length, COMPONENT_MERGES.length);
  const byName = new Map(stored.rows.map(function (row) { return [row.name, row]; }));
  COMPONENT_MERGES.forEach(function (definition) {
    assert.equal(Number(byName.get(definition.finalName).total_quantity), definition.expectedTotal);
  });
  assert.equal(Number(byName.get("Logitech Webcams").checked_out_quantity), 1);

  const holding = await database.query(
    `SELECT components.name, inventory.checked_out_quantity
       FROM checkout_team_inventory inventory
       JOIN checkout_components components ON components.id = inventory.component_id`
  );
  assert.deepEqual(holding.rows.map(function (row) {
    return { name: row.name, quantity: Number(row.checked_out_quantity) };
  }), [{ name: "Logitech Webcams", quantity: 1 }]);

  const second = await applyComponentMerges(database);
  assert.equal(second.filter(function (item) { return item.status === "unchanged"; }).length, COMPONENT_MERGES.length);
  await resetDatabaseForTests();
});
