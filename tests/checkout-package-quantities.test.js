const test = require("node:test");
const assert = require("node:assert/strict");

process.env.CHECKOUT_PGLITE_PATH = "memory://";
process.env.CHECKOUT_FORCE_LIVE = "true";

const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const {
  PACKAGE_QUANTITY_CORRECTIONS,
  applyPackageQuantityCorrections
} = require("../scripts/seed-checkout-package-quantities");

test("package quantity corrections convert containers to individual checkout units", async function () {
  const database = await getDatabase();
  await database.query(
    `INSERT INTO checkout_users (username, password_hash, role, display_name)
     VALUES ('package-auditor', 'not-used-in-this-test', 'admin', 'Package Auditor')`
  );

  for (const correction of PACKAGE_QUANTITY_CORRECTIONS) {
    await database.query(
      `INSERT INTO checkout_components
        (name, category, compatibility, total_quantity, max_active_per_team, active)
       VALUES ($1, 'Electronics', 'N/A', $2, 1, FALSE)`,
      [correction.name, correction.packageTotal]
    );
  }

  const result = await applyPackageQuantityCorrections(database);
  assert.equal(result.updated.length, PACKAGE_QUANTITY_CORRECTIONS.length);
  assert.deepEqual(result.missing, []);

  const stored = await database.query(
    "SELECT name, total_quantity, max_active_per_team, version FROM checkout_components ORDER BY name"
  );
  const byName = new Map(stored.rows.map(function (row) { return [row.name, row]; }));

  PACKAGE_QUANTITY_CORRECTIONS.forEach(function (correction) {
    const component = byName.get(correction.name);
    assert.equal(Number(component.total_quantity), correction.unitTotal);
    assert.equal(Number(component.max_active_per_team), correction.maxActivePerTeam);
    assert.equal(Number(component.version), 2);
  });

  const transactions = await database.query(
    "SELECT COUNT(*) AS count FROM checkout_inventory_transactions WHERE transaction_type = 'INVENTORY_ADJUSTMENT'"
  );
  assert.equal(Number(transactions.rows[0].count), PACKAGE_QUANTITY_CORRECTIONS.length);

  const secondRun = await applyPackageQuantityCorrections(database);
  assert.equal(secondRun.updated.length, 0);
  assert.equal(secondRun.unchanged.length, PACKAGE_QUANTITY_CORRECTIONS.length);
  await resetDatabaseForTests();
});
