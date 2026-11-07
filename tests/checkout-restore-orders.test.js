const test=require('node:test');
const assert=require('node:assert/strict');
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const {restoreExpired}=require('../scripts/restore-expired-orders');
process.env.CHECKOUT_PGLITE_PATH='memory://';
test('restoration re-reserves approved stock, preserves stage/history, and cannot double-reserve scarce stock',async()=>{
  const db=await getDatabase();
  try{
    await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('restore-admin','unused','admin','Restore admin')");
    const team=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Restore team','restore-team') RETURNING id")).rows[0];
    const component=(await db.query("INSERT INTO checkout_components(name,category,compatibility,total_quantity) VALUES('Restore component','Electronics','N/A',2) RETURNING id")).rows[0];
    const order=(await db.query("INSERT INTO checkout_orders(team_id,status,expired_at,ready_at) VALUES($1,'expired',NOW(),NOW()) RETURNING id",[team.id])).rows[0];
    await db.query('INSERT INTO checkout_order_items(order_id,component_id,requested_quantity,approved_quantity) VALUES($1,$2,2,2)',[order.id,component.id]);
    const result=await restoreExpired(db,{since:'2026-01-01T00:00:00Z',apply:true});
    assert.equal(result[0].status,'ready');
    assert.equal(result[0].reservations[0].quantity,2);
    assert.equal(Number((await db.query('SELECT reserved_quantity FROM checkout_components WHERE id=$1',[component.id])).rows[0].reserved_quantity),2);
    assert.equal((await db.query('SELECT reservation_expires_at FROM checkout_orders WHERE id=$1',[order.id])).rows[0].reservation_expires_at,null);
    assert.deepEqual(await restoreExpired(db,{since:'2026-01-01T00:00:00Z',apply:true}),[]);
    const conflicting=(await db.query("INSERT INTO checkout_orders(team_id,status,expired_at) VALUES($1,'expired',NOW()) RETURNING id",[team.id])).rows[0];
    await db.query('INSERT INTO checkout_order_items(order_id,component_id,requested_quantity,approved_quantity) VALUES($1,$2,1,1)',[conflicting.id,component.id]);
    const conflict=await restoreExpired(db,{since:'2026-01-01T00:00:00Z',apply:true});
    assert.equal(conflict[0].restored,false);
    assert.equal(conflict[0].shortages[0].available,0);
    assert.equal(Number((await db.query('SELECT reserved_quantity FROM checkout_components WHERE id=$1',[component.id])).rows[0].reserved_quantity),2);
    const transferred=await restoreExpired(db,{since:'2026-01-01T00:00:00Z',apply:true,transfers:[{fromOrderId:Number(order.id),toOrderId:Number(conflicting.id),componentId:Number(component.id),quantity:1}]});
    assert.equal(transferred[0].restored,true);
    assert.equal(transferred[0].reservations[0].quantity,1);
    assert.equal(Number((await db.query('SELECT reserved_quantity FROM checkout_components WHERE id=$1',[component.id])).rows[0].reserved_quantity),2);
    assert.equal(Number((await db.query('SELECT approved_quantity FROM checkout_order_items WHERE order_id=$1',[order.id])).rows[0].approved_quantity),1);
    await assert.rejects(db.query("UPDATE checkout_orders SET status='expired' WHERE id=$1",[order.id]),/expiration is disabled/);
  }finally{await resetDatabaseForTests();}
});
