const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { Pool } = require("pg");
const service = require("../api/_lib/checkout-service");

const connectionString = process.env.CHECKOUT_POSTGRES_TEST_URL;
const schemaName = `checkout_test_${crypto.randomBytes(6).toString("hex")}`;
let adminPool;
let pool;
let database;

function normalize(result) {
  return { rows: result.rows || [], rowCount: result.rowCount == null ? 0 : result.rowCount };
}

function transactionAdapter(client) {
  const adapter = {
    query: async function (text, values) { return normalize(await client.query(text, values || [])); }
  };
  adapter.transaction = async function (callback) { return callback(adapter); };
  return adapter;
}

before(async function () {
  if (!connectionString) return;
  adminPool = new Pool({ connectionString, max: 2 });
  await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
  pool = new Pool({ connectionString, max: 10, options: `-c search_path=${schemaName}` });
  await pool.query(fs.readFileSync(path.join(process.cwd(), "db", "checkout-schema.sql"), "utf8"));
  database = {
    query: async function (text, values) { return normalize(await pool.query(text, values || [])); },
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await callback(transactionAdapter(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
});

after(async function () {
  if (pool) await pool.end();
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool.end();
  }
});

test("real PostgreSQL serializes team submissions, inventory reservations, and admin claims", {
  skip: !connectionString ? "Set CHECKOUT_POSTGRES_TEST_URL to a disposable PostgreSQL database." : false
}, async function () {
  const teamRows = await database.query(
    `INSERT INTO checkout_teams (name, identifier)
     VALUES ('Postgres Team A', 'pg-team-a'), ('Postgres Team B', 'pg-team-b'),
            ('Postgres Team C', 'pg-team-c'), ('Postgres Same Team', 'pg-same-team')
     RETURNING *`
  );
  const admins = await database.query(
    `INSERT INTO checkout_users (username, password_hash, role, display_name)
     VALUES ('pg-admin-1', 'unused', 'admin', 'PG Admin 1'),
            ('pg-admin-2', 'unused', 'admin', 'PG Admin 2'),
            ('pg-admin-3', 'unused', 'admin', 'PG Admin 3')
     RETURNING *`
  );
  const components = await database.query(
    `INSERT INTO checkout_components
      (name, description, image_url, image_alt, category, compatibility, total_quantity, max_active_per_team, active)
     VALUES ('Postgres Final Item', 'Concurrency item', '/test.svg', 'Test item', 'Electronics', 'N/A', 1, 1, TRUE),
            ('Postgres Same Item A', 'Same-team lock item', '/test.svg', 'Test item A', 'Electronics', 'N/A', 3, 1, TRUE),
            ('Postgres Same Item B', 'Same-team lock item', '/test.svg', 'Test item B', 'Electronics', 'N/A', 3, 1, TRUE)
     RETURNING *`
  );
  const teamActors = teamRows.rows.slice(0, 3).map(function (team, index) {
    return { id: 1000 + index, team_id: team.id, team_name: team.name, role: "team" };
  });
  const finalItemId = components.rows[0].id;
  const competing = await Promise.allSettled(teamActors.map(function (actor) {
    return service.submitOrder(database, { items: [{ componentId: finalItemId, quantity: 1 }] }, actor);
  }));
  assert.equal(competing.filter(function (result) { return result.status === "fulfilled"; }).length, 1);
  assert.equal(competing.filter(function (result) { return result.status === "rejected" && result.reason.status === 409; }).length, 2);
  const finalInventory = await database.query("SELECT reserved_quantity FROM checkout_components WHERE id = $1", [finalItemId]);
  assert.equal(Number(finalInventory.rows[0].reserved_quantity), 1);

  const sameTeam = teamRows.rows[3];
  const sameActor = { id: 2000, team_id: sameTeam.id, team_name: sameTeam.name, role: "team" };
  const simultaneous = await Promise.allSettled([
    service.submitOrder(database, { items: [{ componentId: components.rows[1].id, quantity: 1 }] }, sameActor),
    service.submitOrder(database, { items: [{ componentId: components.rows[2].id, quantity: 1 }] }, sameActor)
  ]);
  assert.equal(simultaneous.filter(function (result) { return result.status === "fulfilled"; }).length, 1);
  assert.equal(simultaneous.filter(function (result) { return result.status === "rejected" && result.reason.status === 429; }).length, 1);

  const winningOrder = competing.find(function (result) { return result.status === "fulfilled"; }).value;
  const adminActors = admins.rows.map(function (admin) {
    return { id: admin.id, display_name: admin.display_name, role: "admin" };
  });
  const claims = await Promise.allSettled(adminActors.map(function (admin) {
    return service.claimOrder(database, { orderId: winningOrder.id }, admin);
  }));
  assert.equal(claims.filter(function (result) { return result.status === "fulfilled"; }).length, 1);
  assert.equal(claims.filter(function (result) { return result.status === "rejected" && result.reason.status === 409; }).length, 2);
});
