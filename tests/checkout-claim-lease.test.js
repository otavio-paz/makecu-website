const assert = require('node:assert/strict');
const fs = require('node:fs');
const { before, after, test } = require('node:test');
delete process.env.DATABASE_URL;
process.env.CHECKOUT_PGLITE_PATH = 'memory://';
const { getDatabase, resetDatabaseForTests } = require('../api/_lib/checkout-db');
const service = require('../api/_lib/checkout-service');
const schema = fs.readFileSync('db/checkout-schema.sql', 'utf8');
const migration = schema.split('-- BEGIN MINIMUM CLAIM LEASE MIGRATION')[1].split('-- END MINIMUM CLAIM LEASE MIGRATION')[0];
let db, admin, peer, component, count = 0;

before(async () => {
  db = await getDatabase();
  const admins = (await db.query(`INSERT INTO checkout_users(username,password_hash,role,display_name)
    VALUES ('lease-admin','unused','admin','Lease Admin'),('lease-peer','unused','admin','Lease Peer') RETURNING *`)).rows;
  [admin, peer] = admins;
  component = (await db.query(`INSERT INTO checkout_components(name,description,image_url,image_alt,category,compatibility,total_quantity,max_active_per_team)
    VALUES ('Lease test part','Test part','/test.svg','Test part','Electronics','N/A',100,10) RETURNING *`)).rows[0];
});
after(resetDatabaseForTests);

async function order() {
  const name = `lease-team-${++count}`;
  const team = (await db.query('INSERT INTO checkout_teams(name,identifier) VALUES ($1,$1) RETURNING *', [name])).rows[0];
  return service.submitOrder(db, { items: [{ componentId: Number(component.id), quantity: 1 }] }, { id: admin.id, team_id: team.id, team_name: name });
}
async function lease(orderId) {
  return (await db.query(`SELECT *,EXTRACT(EPOCH FROM(claim_expires_at-NOW())) AS seconds FROM checkout_orders WHERE id=$1`, [orderId])).rows[0];
}
async function assertHour(orderId) {
  const row = await lease(orderId);
  assert.ok(Number(row.seconds) >= 3590 && Number(row.seconds) <= 3610, `Expected one hour, got ${row.seconds} seconds`);
  assert.equal(row.reservation_expires_at, null);
}

test('new review claims last an hour and other volunteers cannot take them early', async () => {
  const item = await order();
  await service.claimOrder(db, { orderId: item.id }, admin);
  await assertHour(item.id);
  await assert.rejects(service.claimOrder(db, { orderId: item.id }, peer), error => error.status === 409);
});

test('renewal and saving adjustments grant an hour without shortening a longer lease', async () => {
  const item = await order();
  await service.claimOrder(db, { orderId: item.id }, admin);
  await service.claimOrder(db, { orderId: item.id }, admin);
  await assertHour(item.id);
  await service.adjustOrder(db, { orderId: item.id, items: [{ itemId: item.items[0].id, approvedQuantity: 1, note: 'Reviewed' }] }, admin);
  await assertHour(item.id);
  await db.query("UPDATE checkout_orders SET claim_expires_at=NOW()+INTERVAL '2 hours' WHERE id=$1", [item.id]);
  const long = (await lease(item.id)).claim_expires_at;
  await service.claimOrder(db, { orderId: item.id }, admin);
  await service.adjustOrder(db, { orderId: item.id, items: [] }, admin);
  assert.equal(new Date((await lease(item.id)).claim_expires_at).getTime(), new Date(long).getTime());
});

test('expired claims can be taken over for another hour and accepted orders keep no lease', async () => {
  const item = await order();
  await service.claimOrder(db, { orderId: item.id }, admin);
  await db.query("UPDATE checkout_orders SET claim_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [item.id]);
  await service.claimOrder(db, { orderId: item.id }, peer);
  await assertHour(item.id);
  await service.transitionOrder(db, { orderId: item.id }, peer, 'accept');
  assert.equal((await lease(item.id)).claim_expires_at, null);
  await service.transitionOrder(db, { orderId: item.id }, peer, 'ready');
  assert.equal((await lease(item.id)).reservation_expires_at, null);
});

test('the database upgrades seven-minute writes from older workers and preserves longer pauses', async () => {
  const item = await order();
  await db.query("UPDATE checkout_orders SET status='reviewing',reviewed_by=$2,reviewing_at=NOW(),claim_expires_at=NOW()+INTERVAL '7 minutes' WHERE id=$1", [item.id, admin.id]);
  await assertHour(item.id);
  await db.query("UPDATE checkout_orders SET claim_expires_at=NOW()+INTERVAL '2 hours' WHERE id=$1", [item.id]);
  const long = (await lease(item.id)).claim_expires_at;
  await db.query("UPDATE checkout_orders SET claim_expires_at=NOW()+INTERVAL '7 minutes' WHERE id=$1", [item.id]);
  assert.equal(new Date((await lease(item.id)).claim_expires_at).getTime(), new Date(long).getTime());
});

test('protected-stock exception orders receive the same one-hour claim', async () => {
  const item = await order();
  const protectedPart = (await db.query(`INSERT INTO checkout_components(name,category,compatibility,total_quantity,protected_stock)
    VALUES('Protected lease part','Electronics','N/A',3,3) RETURNING *`)).rows[0];
  const result = await service.createProtectedStockOverrideOrder(db, { teamId: item.teamId, reason: 'Organizer approved test', items: [{ componentId: Number(protectedPart.id), quantity: 1 }] }, admin);
  await assertHour(result.id);
});

test('migration extends existing reviews once and repeated initialization does not renew leases', async () => {
  const item = await order();
  await service.claimOrder(db, { orderId: item.id }, admin);
  await db.exec('DROP TRIGGER checkout_minimum_claim_lease ON checkout_orders');
  await db.query("UPDATE checkout_orders SET claim_expires_at=NOW()+INTERVAL '7 minutes' WHERE id=$1", [item.id]);
  await db.query("DELETE FROM checkout_policy_migrations WHERE name='minimum-claim-lease-60-minutes-v1'");
  await db.exec(migration);
  await assertHour(item.id);
  const first = (await lease(item.id)).claim_expires_at;
  await db.exec(migration);
  assert.equal(new Date((await lease(item.id)).claim_expires_at).getTime(), new Date(first).getTime());
  await service.releaseClaim(db, { orderId: item.id }, admin);
  assert.equal((await lease(item.id)).claim_expires_at, null);
});
