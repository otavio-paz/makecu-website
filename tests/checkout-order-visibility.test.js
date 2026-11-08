const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.CHECKOUT_PGLITE_PATH = "memory://";
process.env.CHECKOUT_FORCE_LIVE = "true";

const handler = require("../api/checkout");
const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { createSession } = require("../api/_lib/checkout-auth");
const service = require("../api/_lib/checkout-service");

let database;
let componentId;
let sequence = 0;
let owner, supervisor, peer, third;

async function user(username, displayName, role = "admin", teamId = null) {
  const actor = (await database.query(
    `INSERT INTO checkout_users (username, display_name, role, team_id, password_hash)
     VALUES ($1, $2, $3, $4, 'unused') RETURNING *`,
    [username, displayName, role, teamId]
  )).rows[0];
  let cookie;
  await createSession(database, { setHeader(name, value) { cookie = value.split(";")[0]; } }, actor.id);
  return { actor, cookie };
}

function request(action, account, payload = {}) {
  return new Promise((resolve, reject) => {
    const incoming = {
      method: "POST", query: {},
      headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", cookie: account?.cookie },
      body: { action, idempotencyKey: `visibility-${++sequence}`, ...payload }
    };
    handler(incoming, {
      statusCode: 200, setHeader() {},
      end(value) { resolve({ status: this.statusCode, body: JSON.parse(value) }); }
    }).catch(reject);
  });
}

async function board(account, payload) {
  const result = await request("admin-orders", account, payload);
  assert.equal(result.status, 200);
  return result.body.orders;
}

async function visible(account, orderId) {
  return (await board(account)).some(order => order.id === orderId);
}

async function newOrder() {
  const name = `visibility-team-${++sequence}`;
  const team = (await database.query(
    "INSERT INTO checkout_teams (name, identifier) VALUES ($1, $1) RETURNING *", [name]
  )).rows[0];
  const account = await user(name, name, "team", team.id);
  const order = await service.submitOrder(database, {
    items: [{ componentId, quantity: 1 }]
  }, { ...account.actor, team_name: name });
  return { order, account };
}

async function mutate(action, account, orderId) {
  const result = await request(action, account, { orderId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.order;
}

before(async () => {
  database = await getDatabase();
  // Admin-1 deliberately does not have numeric user ID 1. Display names are mutable.
  owner = await user("admin-2", "Volunteer Two");
  supervisor = await user("admin-1", "Renamed organizer");
  peer = await user("admin-3", "Otavio Paz");
  third = await user("admin-4", "Volunteer Four");
  componentId = Number((await database.query(
    `INSERT INTO checkout_components
      (name, description, image_url, image_alt, category, compatibility, total_quantity, max_active_per_team)
     VALUES ('Queue part', 'Queue visibility test part', '/test.svg', 'Test part', 'Electronics', 'N/A', 1000, 10)
     RETURNING id`
  )).rows[0].id);
});

after(async () => { await resetDatabaseForTests(); });

test("all admins receive submitted orders oldest first, with stable timestamp ties", async () => {
  const { order: newer } = await newOrder();
  const { order: first } = await newOrder();
  const { order: second } = await newOrder();
  for (const order of [first, second, newer]) {
    await database.query("UPDATE checkout_orders SET created_at = $2 WHERE id = $1", [
      order.id, order.id === newer.id ? "2026-11-07T14:00:00Z" : "2026-11-07T13:00:00Z"
    ]);
  }
  const ids = new Set([newer.id, first.id, second.id]);
  for (const account of [owner, peer, third, supervisor]) {
    const orders = (await board(account)).filter(order => ids.has(order.id));
    assert.deepEqual(orders.map(order => order.id), [first.id, second.id, newer.id]);
    assert.equal(orders[0].items[0].componentId, componentId);
  }
});

test("claim ownership scopes reviewing, accepted and ready orders while admin-1 sees all", async () => {
  const { order, account } = await newOrder();
  await mutate("claim-order", owner, order.id);
  for (const next of [null, "accept-order", "mark-ready"]) {
    if (next) await mutate(next, owner, order.id);
    assert.equal(await visible(owner, order.id), true);
    assert.equal(await visible(supervisor, order.id), true);
    assert.equal(await visible(peer, order.id), false);
    assert.equal(await visible(third, order.id), false);
    // A different display name or fields supplied by the browser cannot grant the exception.
    const spoofed = await board(peer, { username: "admin-1", id: supervisor.actor.id, role: "admin" });
    assert.equal(spoofed.some(item => item.id === order.id), false);
    const dashboard = await request("team-dashboard", account);
    assert.equal(dashboard.body.orders[0].id, order.id);
  }
  await mutate("confirm-pickup", owner, order.id);
  for (const account of [owner, peer, third, supervisor]) {
    assert.equal(await visible(account, order.id), true, "completed history stays shared");
  }
});

test("claim renewal keeps ownership; release shares the order; observation grants no takeover", async () => {
  const { order } = await newOrder();
  await mutate("claim-order", owner, order.id);
  await mutate("claim-order", owner, order.id);
  assert.equal(await visible(peer, order.id), false);
  for (const account of [peer, supervisor]) {
    assert.equal((await request("claim-order", account, { orderId: order.id })).status, 409);
    assert.equal((await request("release-claim", account, { orderId: order.id })).status, 409);
    assert.equal((await request("accept-order", account, { orderId: order.id })).status, 409);
  }
  await mutate("release-claim", owner, order.id);
  assert.equal(await visible(peer, order.id), true);
  await mutate("claim-order", peer, order.id);
  assert.equal(await visible(peer, order.id), true);
  assert.equal(await visible(owner, order.id), false);
  await mutate("cancel-order", peer, order.id);
  assert.equal(await visible(owner, order.id), true);
});

test("expired, boundary-time and missing review leases reappear and can be claimed again", async () => {
  for (const expiry of ["NOW() - INTERVAL '1 second'", "NOW()", "NULL"]) {
    const { order } = await newOrder();
    await mutate("claim-order", owner, order.id);
    await database.query(`UPDATE checkout_orders SET claim_expires_at = ${expiry} WHERE id = $1`, [order.id]);
    assert.equal(await visible(peer, order.id), true);
    assert.equal(await visible(supervisor, order.id), true);
    await mutate("claim-order", peer, order.id);
    assert.equal(await visible(owner, order.id), false);
    assert.equal(await visible(peer, order.id), true);
  }
});

test("simultaneous claims yield one owner and every other admin's refreshed board excludes it", async () => {
  const { order } = await newOrder();
  const accounts = [owner, peer, third];
  const results = await Promise.all(accounts.map(account => request("claim-order", account, { orderId: order.id })));
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 2);
  for (let index = 0; index < accounts.length; index += 1) {
    assert.equal(await visible(accounts[index], order.id), results[index].status === 200);
  }
  assert.equal(await visible(supervisor, order.id), true);
});

test("unauthenticated and team sessions cannot access the admin board", async () => {
  const { account } = await newOrder();
  assert.equal((await request("admin-orders")).status, 401);
  assert.equal((await request("admin-orders", account, { username: "admin-1" })).status, 403);
  await assert.rejects(service.adminOrders(database), error => error.status === 403);
  await assert.rejects(service.adminOrders(database, account.actor), error => error.status === 403);
});
