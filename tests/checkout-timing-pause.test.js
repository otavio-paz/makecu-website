const test=require('node:test');
const assert=require('node:assert/strict');
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const service=require('../api/_lib/checkout-service');
const {pauseTiming}=require('../scripts/pause-order-timing');
process.env.CHECKOUT_PGLITE_PATH='memory://';
test('two-hour pause permits repeated orders, protects claim leases, and expires automatically',async()=>{
  const db=await getDatabase();
  try{
    const admin=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('pause-admin','unused','admin','Pause admin') RETURNING *")).rows[0];
    const team=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Pause team','pause-team') RETURNING *")).rows[0];
    const actor=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name,team_id) VALUES('pause-team','unused','team','Pause team',$1) RETURNING *",[team.id])).rows[0];
    actor.team_name=team.name;
    const component=(await db.query("INSERT INTO checkout_components(name,category,compatibility,total_quantity,max_active_per_team) VALUES('Pause item','Electronics','N/A',10,10) RETURNING id")).rows[0];
    const body={items:[{componentId:Number(component.id),quantity:1}]};
    await service.submitOrder(db,body,actor);
    const pause=await pauseTiming(db);
    const second=await service.submitOrder(db,body,actor);
    await service.submitOrder(db,body,actor);
    await service.claimOrder(db,{orderId:second.id},admin);
    const order=(await db.query('SELECT claim_expires_at,reservation_expires_at FROM checkout_orders WHERE id=$1',[second.id])).rows[0];
    assert.ok(new Date(order.claim_expires_at)>=new Date(pause.pausedUntil));
    assert.equal(order.reservation_expires_at,null);
    assert.equal((await service.teamDashboard(db,actor)).cooldownSeconds,0);
    await db.query("UPDATE checkout_order_cooldown_overrides SET consumed_at=NOW(),order_id=$1 WHERE reason='Temporary organizer timing pause'",[second.id]);
    assert.equal((await db.query("SELECT consumed_at FROM checkout_order_cooldown_overrides WHERE reason='Temporary organizer timing pause'")).rows[0].consumed_at,null);
    await db.query("UPDATE checkout_timing_controls SET paused_until=NOW()-INTERVAL '1 second'");
    await db.query("UPDATE checkout_order_cooldown_overrides SET expires_at=NOW()-INTERVAL '1 second' WHERE reason='Temporary organizer timing pause'");
    await assert.rejects(service.submitOrder(db,body,actor),e=>e.status===429);
  }finally{await resetDatabaseForTests();}
});
