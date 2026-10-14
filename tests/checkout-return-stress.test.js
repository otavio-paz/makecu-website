const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.CHECKOUT_PGLITE_PATH = "memory://";

const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { processReturn } = require("../api/_lib/checkout-service");

let database;
let admin;
let teamId;
let componentIds;

before(async function () {
  database = await getDatabase();
  const team = await database.query(
    "INSERT INTO checkout_teams (name, identifier) VALUES ('Return Stress Team', 'return-stress-team') RETURNING id"
  );
  teamId = Number(team.rows[0].id);
  const adminResult = await database.query(
    "INSERT INTO checkout_users (username, password_hash, role, display_name) VALUES ('return-stress-admin', 'unused', 'admin', 'Return Stress Admin') RETURNING *"
  );
  admin = adminResult.rows[0];
  componentIds = [];

  for (let index = 0; index < 75; index += 1) {
    const component = await database.query(
      `INSERT INTO checkout_components
        (name, category, compatibility, total_quantity, checked_out_quantity, max_active_per_team)
       VALUES ($1, 'Electronics', 'N/A', 10, 10, 10)
       RETURNING id`,
      [`Return stress component ${index + 1}`]
    );
    const componentId = Number(component.rows[0].id);
    componentIds.push(componentId);
    await database.query(
      "INSERT INTO checkout_team_inventory (team_id, component_id, checked_out_quantity) VALUES ($1, $2, 10)",
      [teamId, componentId]
    );
  }
});

after(async function () {
  await resetDatabaseForTests();
});

test("large multi-item returns stay atomic and preserve every outcome", async function () {
  const conditions = ["good", "damaged", "missing"];
  const detail = await processReturn(database, {
    teamId,
    items: componentIds.map(function (componentId, index) {
      const condition = conditions[index % conditions.length];
      return {
        componentId,
        quantity: 3,
        condition,
        note: condition === "good" ? "" : `Stress-test ${condition} note ${index + 1}`
      };
    })
  }, admin);

  assert.equal(detail.returns[0].items.length, 75);
  assert.equal(detail.inventory.length, 75);
  assert.ok(detail.inventory.every(function (item) { return item.checkedOutQuantity === 7; }));

  const counters = await database.query(
    "SELECT checked_out_quantity, unavailable_quantity FROM checkout_components ORDER BY id"
  );
  assert.ok(counters.rows.every(function (row) { return Number(row.checked_out_quantity) === 7; }));
  assert.equal(counters.rows.filter(function (row) { return Number(row.unavailable_quantity) === 3; }).length, 50);

  await assert.rejects(function () {
    return processReturn(database, {
      teamId,
      items: [
        { componentId: componentIds[0], quantity: 2, condition: "good", note: "" },
        { componentId: componentIds[1], quantity: 99, condition: "good", note: "" }
      ]
    }, admin);
  }, function (error) {
    return error.status === 409;
  });

  const afterRejectedBatch = await database.query(
    "SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id = $1 AND component_id = ANY($2) ORDER BY component_id",
    [teamId, componentIds.slice(0, 2)]
  );
  assert.deepEqual(afterRejectedBatch.rows.map(function (row) { return Number(row.checked_out_quantity); }), [7, 7]);
});
