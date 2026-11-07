const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');

async function restoreExpired(database,{since,stockLimits={},allowPartial=false,apply=false,transfers=[]}){
  if(!since || !Number.isFinite(Date.parse(since))) throw new Error('An explicit expiration cutoff is required.');
  return database.transaction(async tx=>{
    const actor=(await tx.query("SELECT id FROM checkout_users WHERE active=TRUE AND role='admin' ORDER BY id LIMIT 1")).rows[0];
    if(!actor) throw new Error('Active admin required.');
    if(transfers.length&&!apply)throw new Error('Transfers require an explicit apply operation.');
    for(const transfer of transfers){
      const orders=(await tx.query('SELECT * FROM checkout_orders WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[[transfer.fromOrderId,transfer.toOrderId]])).rows;
      const target=orders.find(o=>Number(o.id)===transfer.toOrderId);
      const source=orders.find(o=>Number(o.id)===transfer.fromOrderId);
      if(!target||target.status!=='expired'||new Date(target.expired_at)<new Date(since)||!source||!['submitted','reviewing','accepted','ready'].includes(source.status))throw new Error('Reservation transfer orders changed; review their current status.');
      const item=(await tx.query('SELECT * FROM checkout_order_items WHERE order_id=$1 AND component_id=$2 FOR UPDATE',[source.id,transfer.componentId])).rows[0];
      if(!item||Number(item.approved_quantity)<transfer.quantity)throw new Error('Source order no longer has the requested reservation.');
      await tx.query('UPDATE checkout_order_items SET approved_quantity=approved_quantity-$2,adjustment_reason=$3 WHERE id=$1',[item.id,transfer.quantity,`Organizer reassigned this reservation to restored order ${target.receipt_code}.`]);
      await tx.query('UPDATE checkout_components SET reserved_quantity=reserved_quantity-$2,version=version+1,updated_at=NOW() WHERE id=$1',[transfer.componentId,transfer.quantity]);
      await tx.query("INSERT INTO checkout_inventory_transactions(component_id,team_id,order_id,admin_id,actor_user_id,transaction_type,quantity,note) VALUES($1,$2,$3,$4,$4,'INVENTORY_ADJUSTMENT',$5,$6)",[transfer.componentId,source.team_id,source.id,actor.id,-transfer.quantity,`Organizer authorized transferring reservation to ${target.receipt_code}.`]);
      await tx.query("INSERT INTO checkout_order_events(order_id,actor_user_id,event_type,details) VALUES($1,$2,'RESERVATION_REASSIGNED',$3)",[source.id,actor.id,JSON.stringify(transfer)]);
      await tx.query('INSERT INTO checkout_activity(actor_user_id,team_id,order_id,message) VALUES($1,$2,$3,$4)',[actor.id,source.team_id,source.id,`Organizer reassigned ${transfer.quantity} component #${transfer.componentId} from ${source.receipt_code} to restored order ${target.receipt_code}.`]);
    }
    const orders=(await tx.query("SELECT * FROM checkout_orders WHERE status='expired' AND expired_at >= $1 ORDER BY id FOR UPDATE",[since])).rows;
    const result=[];
    for(const order of orders){
      const items=(await tx.query('SELECT * FROM checkout_order_items WHERE order_id=$1 ORDER BY component_id FOR UPDATE',[order.id])).rows;
      const changes=[],shortages=[];
      for(const item of items){
        const component=(await tx.query('SELECT * FROM checkout_components WHERE id=$1 FOR UPDATE',[item.component_id])).rows[0];
        const quantity=Number(item.approved_quantity);
        const allocated=Number(component.mlh_quantity)+Number(component.reserved_quantity)+Number(component.checked_out_quantity)+Number(component.unavailable_quantity);
        const total=Math.max(Number(component.total_quantity),Math.min(Number(stockLimits[component.id]||component.total_quantity),allocated+quantity));
        const available=Math.max(0,total-allocated);
        const reserve=Math.min(quantity,available);
        if(reserve<quantity)shortages.push({componentId:Number(component.id),name:component.name,needed:quantity,available});
        changes.push({item,component,total,reserve});
      }
      if(shortages.length&&!allowPartial){result.push({orderId:Number(order.id),receipt:order.receipt_code,restored:false,shortages});continue;}
      const stage=shortages.length?'submitted':order.ready_at?'ready':order.accepted_at?'accepted':'submitted';
      if(apply){
        for(const {item,component,total,reserve} of changes){
          await tx.query('UPDATE checkout_components SET total_quantity=$2,reserved_quantity=reserved_quantity+$3,version=version+1,updated_at=NOW() WHERE id=$1',[component.id,total,reserve]);
          if(reserve!==Number(item.approved_quantity))await tx.query('UPDATE checkout_order_items SET approved_quantity=$2,adjustment_reason=$3 WHERE id=$1',[item.id,reserve,'Reopened after expiration; additional stock required before this component can be reserved.']);
          await tx.query("INSERT INTO checkout_inventory_transactions(component_id,team_id,order_id,admin_id,actor_user_id,transaction_type,quantity,previous_state,new_state,note) VALUES($1,$2,$3,$4,$4,'INVENTORY_ADJUSTMENT',$5,$6,$7,$8)",[component.id,order.team_id,order.id,actor.id,reserve,JSON.stringify(component),JSON.stringify({totalQuantity:total,reservedQuantity:Number(component.reserved_quantity)+reserve}),'Organizer requested restoration of today\'s expired order; reinstated prior reservation and stock within explicitly approved limits.']);
        }
        await tx.query('UPDATE checkout_orders SET status=$2,expired_at=NULL,reservation_expires_at=NULL,reviewed_by=NULL,claim_expires_at=NULL WHERE id=$1',[order.id,stage]);
        await tx.query("INSERT INTO checkout_order_events(order_id,actor_user_id,event_type,details) VALUES($1,$2,'ORDER_RESTORED',$3)",[order.id,actor.id,JSON.stringify({previousExpiredAt:order.expired_at,status:stage,shortages})]);
        await tx.query('INSERT INTO checkout_activity(actor_user_id,team_id,order_id,message) VALUES($1,$2,$3,$4)',[actor.id,order.team_id,order.id,`Restored expired order ${order.receipt_code} to ${stage} without an expiration deadline.`]);
      }
      result.push({orderId:Number(order.id),receipt:order.receipt_code,restored:apply,status:stage,reservations:changes.map(c=>({name:c.component.name,quantity:c.reserve})),shortages});
    }
    if(transfers.length&&transfers.some(t=>!result.some(r=>r.orderId===t.toOrderId&&r.restored)))throw new Error('Restoration did not complete; reservation transfers rolled back.');
    return result;
  });
}
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
  const since=process.argv[process.argv.indexOf('--since')+1];
  const limits=JSON.parse(process.env.CHECKOUT_RESTORE_STOCK_LIMITS||'{}');
  const transfers=JSON.parse(process.env.CHECKOUT_RESTORE_TRANSFERS||'[]');
  try{console.log(JSON.stringify(await restoreExpired(await getDatabase(),{since,stockLimits:limits,transfers,allowPartial:process.argv.includes('--allow-partial'),apply:process.argv.includes('--apply')}),null,2));}
  finally{await resetDatabaseForTests();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={restoreExpired};
