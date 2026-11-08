const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
delete process.env.DATABASE_URL;
process.env.CHECKOUT_PGLITE_PATH='memory://';
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const {createSession}=require('../api/_lib/checkout-auth');
const {recordUntrackedItem}=require('../api/_lib/checkout-reconciliation');
const service=require('../api/_lib/checkout-service');
const handler=require('../api/checkout');
let db,admin,teamUser,alpha,beta,part,empty,adminCookie,teamCookie;
async function cookie(user){let value;await createSession(db,{setHeader(k,v){value=v.split(';')[0];}},user.id);return value;}
function request(payload,session){return new Promise((resolve,reject)=>handler({method:'POST',query:{},headers:{host:'localhost',origin:'http://localhost',cookie:session},body:payload},
  {statusCode:200,setHeader(){},end(raw){resolve({status:this.statusCode,body:JSON.parse(raw)});}}).catch(reject));}
before(async()=>{
  db=await getDatabase();
  admin=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('inventory-admin','unused','admin','Volunteer') RETURNING *")).rows[0];
  alpha=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Alpha team','team-alpha') RETURNING *")).rows[0];
  beta=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Beta team','team-beta') RETURNING *")).rows[0];
  const zero=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Zero team','team-zero') RETURNING id")).rows[0];
  teamUser=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name,team_id) VALUES('team-alpha','unused','team','Team',$1) RETURNING *",[alpha.id])).rows[0];
  part=(await db.query("INSERT INTO checkout_components(name,category,compatibility,total_quantity,checked_out_quantity,reserved_quantity,active) VALUES('Held board','Electronics','N/A',20,5,4,FALSE) RETURNING *")).rows[0];
  empty=(await db.query("INSERT INTO checkout_components(name,category,compatibility,total_quantity) VALUES('Unheld board','Electronics','N/A',10) RETURNING *")).rows[0];
  await db.query('INSERT INTO checkout_team_inventory(team_id,component_id,checked_out_quantity) VALUES($1,$2,2),($3,$2,3),($4,$2,0),($1,$5,0)',[alpha.id,part.id,beta.id,zero.id,empty.id]);
  adminCookie=await cookie(admin);teamCookie=await cookie(teamUser);
});
after(resetDatabaseForTests);

test('component holdings lists positive current holdings for each team, including inactive components, and is read-only',async()=>{
  const snapshot=async()=>JSON.stringify({components:(await db.query('SELECT * FROM checkout_components ORDER BY id')).rows,holdings:(await db.query('SELECT * FROM checkout_team_inventory ORDER BY team_id,component_id')).rows,audits:(await db.query('SELECT * FROM checkout_inventory_transactions ORDER BY id')).rows});
  const before=await snapshot();
  const result=await request({action:'component-holdings',componentId:Number(part.id)},adminCookie);
  assert.equal(result.status,200);assert.equal(result.body.componentName,'Held board');assert.equal(result.body.totalHeldQuantity,5);
  assert.deepEqual(result.body.teams,[{teamId:Number(alpha.id),teamName:'Alpha team',identifier:'team-alpha',quantity:2},{teamId:Number(beta.id),teamName:'Beta team',identifier:'team-beta',quantity:3}]);
  assert.equal(await snapshot(),before);
});

test('holdings are admin-only and available outside the event window',async()=>{
  const body={action:'component-holdings',componentId:Number(part.id)};
  assert.equal((await request(body)).status,401);assert.equal((await request(body,teamCookie)).status,403);
  const second=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('inventory-admin-2','unused','admin','Another volunteer') RETURNING *")).rows[0];
  process.env.CHECKOUT_LIVE_START='2099-01-01T00:00:00Z';process.env.CHECKOUT_LIVE_END='2099-01-02T00:00:00Z';
  try {assert.equal((await request(body,await cookie(second))).body.teams.length,2);}
  finally {delete process.env.CHECKOUT_LIVE_START;delete process.env.CHECKOUT_LIVE_END;}
});

test('unheld components return an empty list and invalid or missing components fail cleanly',async()=>{
  const result=await request({action:'component-holdings',componentId:Number(empty.id)},adminCookie);
  assert.equal(result.status,200);assert.deepEqual(result.body.teams,[]);assert.equal(result.body.totalHeldQuantity,0);
  for(const componentId of [0,-1,1.5,'invalid',undefined])assert.equal((await request({action:'component-holdings',componentId},adminCookie)).status,400);
  assert.equal((await request({action:'component-holdings',componentId:999999},adminCookie)).status,404);
});

test('a partial return immediately reduces that team quantity and an untracked checkout is also reflected',async()=>{
  await service.processReturn(db,{teamId:Number(alpha.id),items:[{componentId:Number(part.id),quantity:1,condition:'good'}]},admin);
  let result=(await request({action:'component-holdings',componentId:Number(part.id)},adminCookie)).body;
  assert.equal(result.totalHeldQuantity,4);assert.equal(result.teams[0].quantity,1);
  const current=(await db.query('SELECT version FROM checkout_components WHERE id=$1',[part.id])).rows[0];
  await recordUntrackedItem(db,{teamId:Number(alpha.id),componentId:Number(part.id),quantity:2,outcome:'hold',stockMode:'shortfall',approvedStockIncrease:0,expectedVersion:current.version,expectedHeldQuantity:1},admin);
  result=(await request({action:'component-holdings',componentId:Number(part.id)},adminCookie)).body;
  assert.equal(result.totalHeldQuantity,6);assert.equal(result.teams[0].quantity,3);
  await service.processReturn(db,{teamId:Number(alpha.id),items:[{componentId:Number(part.id),quantity:3,condition:'good'}]},admin);
  result=(await request({action:'component-holdings',componentId:Number(part.id)},adminCookie)).body;
  assert.equal(result.teams.length,1);assert.equal(result.teams[0].teamId,Number(beta.id));assert.equal(result.totalHeldQuantity,3);
});
