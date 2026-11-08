const assert = require('node:assert/strict');
const { test, after } = require('node:test');
delete process.env.DATABASE_URL;
process.env.CHECKOUT_PGLITE_PATH = 'memory://';
process.env.CHECKOUT_FORCE_LIVE = 'false';
process.env.CHECKOUT_LIVE_START = '2000-01-01T00:00:00Z';
process.env.CHECKOUT_ORDERING_END = '2001-01-01T00:00:00Z';
process.env.CHECKOUT_RETURN_END = '2100-01-01T00:00:00Z';
const { liveStatus } = require('../api/_lib/checkout-live');
const handler = require('../api/checkout');
const { getDatabase, resetDatabaseForTests } = require('../api/_lib/checkout-db');
const { createSession } = require('../api/_lib/checkout-auth');
after(resetDatabaseForTests);

function statusAt(time, overrides = {}) {
  const settings = {
    CHECKOUT_LIVE_START: '2026-11-07T09:00:00-05:00',
    CHECKOUT_ORDERING_END: '2026-11-08T10:00:00-05:00',
    CHECKOUT_RETURN_END: '2026-11-08T12:00:00-05:00',
    CHECKOUT_FORCE_LIVE: 'true', NODE_ENV: 'production', ...overrides
  };
  const before = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, settings);
    return liveStatus(new Date(time));
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('teams can order after the old pickup cutoff until the return deadline, inclusive', () => {
  for (const time of ['2026-11-08T10:00:01-05:00', '2026-11-08T11:59:59-05:00', '2026-11-08T12:00:00-05:00']) {
    const status = statusAt(time);
    assert.equal(status.orderingOpen, true);
    assert.equal(status.returnsOpen, true);
    assert.equal(status.phase, 'event_active');
    assert.equal(status.forced, false);
    assert.equal(status.orderingEndsAt, '2026-11-08T17:00:00.000Z');
  }
});

test('event start and final closure still apply even with production force-live set', () => {
  for (const time of ['2026-11-07T08:59:59-05:00', '2026-11-08T12:00:00.001-05:00']) {
    const status = statusAt(time);
    assert.equal(status.orderingOpen, false);
    assert.equal(status.returnsOpen, false);
    assert.equal(status.live, false);
    assert.equal(status.forced, false);
  }
});

test('a later configured ordering deadline is preserved without extending returns', () => {
  const status = statusAt('2026-11-08T13:00:00-05:00', { CHECKOUT_ORDERING_END: '2026-11-08T14:00:00-05:00' });
  assert.equal(status.orderingOpen, true);
  assert.equal(status.returnsOpen, false);
  assert.equal(status.orderingEndsAt, '2026-11-08T19:00:00.000Z');
  assert.equal(status.returnEndsAt, '2026-11-08T17:00:00.000Z');
});

function request(action, payload = {}, cookie) {
  return new Promise((resolve, reject) => handler({ method:'POST', query:{},
    headers:{host:'localhost',origin:'http://localhost',cookie},body:{action,...payload} },
    {statusCode:200,setHeader(){},end(raw){resolve({status:this.statusCode,body:JSON.parse(raw)});}}
  ).catch(reject));
}

test('authenticated team submits through the API after the old cutoff; stock, cooldown and role checks remain', async () => {
  const db = await getDatabase();
  const team = (await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Open window team','open-window') RETURNING id")).rows[0];
  const user = (await db.query(`INSERT INTO checkout_users(username,password_hash,role,display_name,team_id)
    VALUES('open-window','unused','team','Open window team',$1) RETURNING id`, [team.id])).rows[0];
  let cookie;
  await createSession(db, {setHeader(name,value){cookie=value.split(';')[0];}}, user.id);
  const part = (await db.query(`INSERT INTO checkout_components(name,description,image_url,image_alt,category,compatibility,total_quantity,max_active_per_team)
    VALUES('Available test part','Test component','/test.svg','Test part','Electronics','N/A',2,2) RETURNING id`)).rows[0];
  const items = [{componentId:Number(part.id),quantity:1}];
  assert.equal((await request('submit-order',{items})).status,401);
  assert.equal((await request('submit-order',{items:[{componentId:Number(part.id),quantity:3}],idempotencyKey:'overstock'},cookie)).status,409);
  const first = await request('submit-order',{items,idempotencyKey:'reopened-order'},cookie);
  assert.equal(first.status,201);
  assert.equal(first.body.order.status,'submitted');
  assert.equal(first.body.order.reservationExpiresAt,null);
  const replay = await request('submit-order',{items,idempotencyKey:'reopened-order'},cookie);
  assert.equal(replay.body.order.id,first.body.order.id);
  assert.equal((await request('submit-order',{items,idempotencyKey:'next-order'},cookie)).status,429);
  assert.equal((await request('admin-orders',{},cookie)).status,403);
  const stored = (await db.query('SELECT reserved_quantity FROM checkout_components WHERE id=$1',[part.id])).rows[0];
  assert.equal(Number(stored.reserved_quantity),1);
});
