const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
delete process.env.DATABASE_URL;
process.env.CHECKOUT_PGLITE_PATH='memory://';
process.env.CHECKOUT_FORCE_LIVE='true';
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const {recordUntrackedItem}=require('../api/_lib/checkout-reconciliation');
const service=require('../api/_lib/checkout-service');
const {createSession}=require('../api/_lib/checkout-auth');
const handler=require('../api/checkout');
let db,admin,team,teamActor,component,sequence=0;
before(async()=>{
  db=await getDatabase();
  admin=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('admin-1','unused','admin','Organizer') RETURNING *")).rows[0];
  team=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Return team','return-team') RETURNING *")).rows[0];
  teamActor=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name,team_id) VALUES('return-team','unused','team','Return team',$1) RETURNING *",[team.id])).rows[0];
});
after(resetDatabaseForTests);
async function fresh(total=10,extra={}){
  component=(await db.query(`INSERT INTO checkout_components(name,description,category,compatibility,total_quantity,active,mlh_quantity)
    VALUES($1,'Test component','Electronics','N/A',$2,FALSE,$3) RETURNING *`,[`Return part ${++sequence}`,total,extra.mlh||0])).rows[0];
  return {teamId:Number(team.id),componentId:Number(component.id),quantity:2,reason:'Unrecorded handout verified by organizer.',
    stockMode:'counted',approvedStockIncrease:0,expectedVersion:1,expectedHeldQuantity:0,outcome:'hold',condition:'good',note:''};
}
async function stored(id=component.id){return(await db.query('SELECT * FROM checkout_components WHERE id=$1',[id])).rows[0];}
async function held(id=component.id){return Number((await db.query('SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id=$1 AND component_id=$2',[team.id,id])).rows[0]?.checked_out_quantity||0);}

test('unrecorded counted stock adds holdings without increasing total or creating orders',async()=>{
  const body=await fresh();const before=Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders')).rows[0].n);
  await recordUntrackedItem(db,body,admin);
  assert.equal(await held(),2);assert.equal((await stored()).total_quantity,10);assert.equal((await stored()).checked_out_quantity,2);
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_orders')).rows[0].n),before);
  assert.ok((await service.activity(db)).some(a=>a.message.includes('UNRECORDED_ISSUE')));
  const dashboard=await service.teamDashboard(db,teamActor);assert.equal(dashboard.cooldownSeconds,0);
  assert.equal(JSON.stringify(dashboard).includes(body.reason),false);
});
test('zero stock requires an exact explicit shortage correction; inactive components can be returned',async()=>{
  const body=await fresh(0);
  await assert.rejects(recordUntrackedItem(db,body,admin),e=>e.status===409);
  assert.equal(await held(),0);
  await assert.rejects(recordUntrackedItem(db,{...body,stockMode:'shortfall',approvedStockIncrease:3},admin),e=>e.status===409);
  await recordUntrackedItem(db,{...body,stockMode:'shortfall',approvedStockIncrease:2,outcome:'return'},admin);
  assert.equal(await held(),0);assert.equal((await stored()).total_quantity,2);assert.equal((await stored()).checked_out_quantity,0);assert.equal((await stored()).active,false);
});
test('this action cannot create a new catalog component, even through direct API input',async()=>{
  const body=await fresh();
  const before=(await db.query('SELECT COUNT(*)::integer AS n FROM checkout_components')).rows[0].n;
  for(const change of [{newComponentName:'Unknown module',description:'New description'}, {componentId:null}, {componentId:'new'}, {description:'Create this instead'}]) {
    await assert.rejects(recordUntrackedItem(db,{...body,...change},admin), e=>e.status===400);
  }
  assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM checkout_components')).rows[0].n,before);
  assert.equal(await held(),0);
});
test('simple existing-component requests get an automatic admin audit reason',async()=>{
  const body=await fresh();delete body.reason;
  await recordUntrackedItem(db,body,admin);
  assert.equal(await held(),2);
  assert.ok((await service.activity(db)).some(a=>a.message.includes('Untracked checkout recorded by a volunteer')));
  const detail=await service.teamAdminDetail(db,body.teamId);
  const option=detail.returnInventory.find(c=>c.componentId===body.componentId);
  assert.equal(option.category,'Electronics');
  assert.ok(Object.hasOwn(option,'imageUrl'));
  assert.ok(Object.hasOwn(option,'imageAlt'));
});
test('invalid quantities, role, source, condition, notes and stale counts leave inventory unchanged',async()=>{
  const body=await fresh();
  await assert.rejects(recordUntrackedItem(db,body,teamActor),e=>e.status===403);
  for(const change of [{quantity:0},{quantity:1.5},{quantity:10001},{reason:''},{expectedVersion:9},{expectedHeldQuantity:1},{outcome:'return',condition:'missing'},{outcome:'return',condition:'damaged',note:''},{stockMode:'guess'}]){
    await assert.rejects(recordUntrackedItem(db,{...body,...change},admin));
    assert.equal(await held(),0);assert.equal((await stored()).total_quantity,10);
  }
  const mlh=await fresh(10,{mlh:2});await assert.rejects(recordUntrackedItem(db,mlh,admin),e=>e.status===409);
});
test('two admins with the same old inventory version cannot both record the same return',async()=>{
  const body=await fresh();const results=await Promise.allSettled([recordUntrackedItem(db,{...body,outcome:'return'},admin),recordUntrackedItem(db,{...body,outcome:'return'},admin)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  assert.equal(await held(),0);assert.equal((await stored()).total_quantity,10);
});
async function cookieFor(actor){let cookie;await createSession(db,{setHeader(k,v){cookie=v.split(';')[0];}},actor.id);return cookie;}
function request(body,cookie){return new Promise((resolve,reject)=>handler({method:'POST',query:{},headers:{host:'localhost',origin:'http://localhost',cookie},body},
  {statusCode:200,setHeader(){},end(raw){resolve({status:this.statusCode,body:JSON.parse(raw)});}}).catch(reject));}
test('API enforces roles and replays record-and-return requests without duplicate receipts',async()=>{
  const body={...(await fresh()),action:'record-untracked-item',outcome:'return',idempotencyKey:'return-replay'};
  const adminCookie=await cookieFor(admin),teamCookie=await cookieFor(teamActor);
  assert.equal((await request(body)).status,401);assert.equal((await request(body,teamCookie)).status,403);
  const before=Number((await db.query('SELECT COUNT(*) AS n FROM checkout_return_receipts')).rows[0].n);
  const first=await request(body,adminCookie);assert.equal(first.status,201);
  assert.deepEqual(await request(body,adminCookie),first);
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM checkout_return_receipts')).rows[0].n),before+1);
  assert.equal((await request({action:'activity'},teamCookie)).status,403);
});

test('added hardware merges with existing holdings and uses the ordinary partial-return workflow', async () => {
  const body = await fresh();
  const original = await recordUntrackedItem(db, body, admin);
  assert.equal(original.inventory.find(i => i.componentId === body.componentId).checkedOutQuantity, 2);
  const updated = await recordUntrackedItem(db, {...body, quantity: 3, expectedVersion: 2, expectedHeldQuantity: 2}, admin);
  assert.equal(updated.inventory.find(i => i.componentId === body.componentId).checkedOutQuantity, 5);
  const dashboard = await service.teamDashboard(db, teamActor);
  assert.ok(JSON.stringify(dashboard).includes(component.name));
  await service.processReturn(db, {teamId: body.teamId, items: [{componentId: body.componentId, quantity: 2, condition: 'good'}]}, admin);
  assert.equal(await held(), 3);
  await service.processReturn(db, {teamId: body.teamId, items: [{componentId: body.componentId, quantity: 3, condition: 'damaged', note: 'Bent pins'}]}, admin);
  assert.equal(await held(), 0);
  assert.equal((await stored()).checked_out_quantity, 0);
  assert.equal((await stored()).unavailable_quantity, 3);
  assert.equal((await stored()).total_quantity, 10);
  assert.equal((await service.discrepancyReport(db)).summary.componentsWithMismatches, 0);
});

test('reservations, unavailable stock and other teams holdings are preserved', async () => {
  const body = await fresh(10);
  const other = (await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Other return team','other-return-team') RETURNING id")).rows[0];
  await db.query('UPDATE checkout_components SET reserved_quantity=3,unavailable_quantity=2,checked_out_quantity=4,protected_stock=1 WHERE id=$1', [component.id]);
  await db.query('INSERT INTO checkout_team_inventory(team_id,component_id,checked_out_quantity) VALUES($1,$2,4)', [other.id,component.id]);
  await assert.rejects(recordUntrackedItem(db, body, admin), e => e.status === 409);
  await recordUntrackedItem(db, {...body, stockMode:'shortfall', approvedStockIncrease:1}, admin);
  const current = await stored();
  assert.equal(current.total_quantity, 11);
  assert.equal(current.reserved_quantity, 3);
  assert.equal(current.unavailable_quantity, 2);
  assert.equal(current.protected_stock, 1);
  assert.equal(current.checked_out_quantity, 6);
  assert.equal(await held(), 2);
  assert.equal((await db.query('SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id=$1 AND component_id=$2',[other.id,component.id])).rows[0].checked_out_quantity,4);
  // This fixture intentionally has synthetic reservations; remove those after checking preservation.
  await db.query('UPDATE checkout_components SET reserved_quantity=0 WHERE id=$1', [component.id]);
});

test('a failed receipt save rolls back stock increases, holdings and the reconciliation audit', async () => {
  const body = await fresh(0);
  const before = (await db.query('SELECT COUNT(*)::integer AS n FROM checkout_inventory_transactions')).rows[0].n;
  const failingDb = {transaction(callback) {return db.transaction(tx => {
    const wrapped = {query(sql, args) {
      if (sql.includes('INSERT INTO checkout_return_items')) throw new Error('Simulated receipt write failure');
      return tx.query(sql,args);
    }};
    wrapped.transaction = async nested => nested(wrapped);
    return callback(wrapped);
  });}};
  await assert.rejects(recordUntrackedItem(failingDb, {...body,stockMode:'shortfall',approvedStockIncrease:2,outcome:'return'}, admin), /Simulated receipt write failure/);
  assert.equal(await held(),0);
  assert.equal((await stored()).total_quantity,0);
  assert.equal((await stored()).checked_out_quantity,0);
  assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM checkout_inventory_transactions')).rows[0].n,before);
});

test('unknown teams and components cannot create holdings or audits', async () => {
  const body=await fresh();
  await assert.rejects(recordUntrackedItem(db,{...body,teamId:999999},admin), e=>e.status===404);
  await assert.rejects(recordUntrackedItem(db,{...body,componentId:999999},admin), e=>e.status===404);
  assert.equal(await held(),0);
});
