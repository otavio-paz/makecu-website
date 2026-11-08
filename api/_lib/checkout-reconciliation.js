const { httpError, positiveInteger, cleanString } = require('./checkout-validation');

function requireAdmin(actor) {
  if (!actor || actor.role !== 'admin') throw httpError(403, 'Only admins may reconcile hardware.');
}

async function audit(transaction, actor, teamId, componentId, type, quantity, before, after, reason, key) {
  await transaction.query(
    `INSERT INTO checkout_inventory_transactions
      (component_id,team_id,admin_id,actor_user_id,transaction_type,quantity,previous_state,new_state,note,idempotency_key)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9)`,
    [componentId,teamId,actor.id,type,quantity,JSON.stringify(before),JSON.stringify(after),reason,key || null]
  );
  await transaction.query('INSERT INTO checkout_activity(actor_user_id,team_id,message) VALUES ($1,$2,$3)',
    [actor.id,teamId,`${type}: component #${componentId}, quantity ${quantity}. ${reason} Before: ${JSON.stringify(before)} After: ${JSON.stringify(after)}`]);
}

async function recordUntrackedItem(database, body, actor) {
  requireAdmin(actor);
  if (body.newComponentName || body.description) throw httpError(400, 'Choose an existing catalog component; new components cannot be created here.');
  const componentId = positiveInteger(body.componentId, 'Component ID');
  const teamId = positiveInteger(body.teamId, 'Team ID');
  const quantity = positiveInteger(body.quantity, 'Quantity');
  if (quantity > 10000) throw httpError(400, 'Record at most 10,000 units at once.');
  const reason = cleanString(body.reason === undefined ? 'Untracked checkout recorded by a volunteer during returns.' : body.reason, 'Reconciliation reason', { max: 500 });
  if (!['hold','return'].includes(body.outcome)) throw httpError(400, 'Choose add to holdings or return now.');
  if (!['counted','shortfall','new_stock'].includes(body.stockMode)) throw httpError(400, 'Choose how the stock was counted.');
  if (body.outcome === 'return' && !['good','damaged'].includes(body.condition)) throw httpError(400, 'A physical return must be good or damaged.');
  const note = cleanString(body.note, 'Return note', { optional: true, max: 1000 });
  if (body.outcome === 'return' && body.condition === 'damaged' && !note) throw httpError(400, 'A damage note is required.');
  const approvedIncrease = positiveInteger(body.approvedStockIncrease, 'Approved stock increase', true);
  return database.transaction(async transaction => {
    // Serialize corrections for one team without blocking foreign-key checks on
    // unrelated orders/receipts for that team.
    if (!(await transaction.query('SELECT id FROM checkout_teams WHERE id=$1 FOR NO KEY UPDATE',[teamId])).rows.length) throw httpError(404,'Team not found.');
    const holding = (await transaction.query('SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id=$1 AND component_id=$2 FOR UPDATE',[teamId,componentId])).rows[0];
    const held = holding ? Number(holding.checked_out_quantity) : 0;
    const current = (await transaction.query('SELECT * FROM checkout_components WHERE id=$1 FOR UPDATE',[componentId])).rows[0];
    if (!current) throw httpError(404,'Component not found.');
    if (Number(current.mlh_quantity) > 0) throw httpError(409,'MLH-managed hardware must be reconciled at the MLH desk.');
    if (Number(current.version) !== positiveInteger(body.expectedVersion,'Component version')) throw httpError(409,'Inventory changed. Reload the team before recording this item.');
    if (held !== positiveInteger(body.expectedHeldQuantity,'Expected holding quantity',true)) throw httpError(409,'This team\'s holdings changed. Reload before recording this item.');
    const physicalAvailable = Number(current.total_quantity)-Number(current.reserved_quantity)-Number(current.checked_out_quantity)-Number(current.unavailable_quantity);
    const increase = body.stockMode === 'counted' ? 0 : body.stockMode === 'new_stock' ? quantity : Math.max(0,quantity-physicalAvailable);
    if (approvedIncrease !== increase) throw httpError(409,`The required stock increase is now ${increase}. Reload and review the count correction.`);
    if (physicalAvailable + increase < quantity) throw httpError(409,`The recorded stock is short by ${quantity-physicalAvailable}. Explicitly approve a count correction first.`);
    await transaction.query(`UPDATE checkout_components SET total_quantity=total_quantity+$2,
      checked_out_quantity=checked_out_quantity+$3,version=version+1,updated_at=NOW() WHERE id=$1`,[componentId,increase,quantity]);
    await transaction.query(`INSERT INTO checkout_team_inventory(team_id,component_id,checked_out_quantity) VALUES ($1,$2,$3)
      ON CONFLICT(team_id,component_id) DO UPDATE SET checked_out_quantity=checkout_team_inventory.checked_out_quantity+EXCLUDED.checked_out_quantity`,[teamId,componentId,quantity]);
    await audit(transaction,actor,teamId,componentId,'UNRECORDED_ISSUE',quantity,
      {teamHeld:held,total:Number(current.total_quantity),checkedOut:Number(current.checked_out_quantity)},
      {teamHeld:held+quantity,total:Number(current.total_quantity)+increase,checkedOut:Number(current.checked_out_quantity)+quantity},
      `${current.name}: ${reason} Stock treatment: ${body.stockMode}; approved increase ${increase}.`);
    const service = require('./checkout-service');
    if (body.outcome === 'return') return service.processReturn(transaction,{teamId,items:[{componentId,quantity,condition:body.condition,note}]},actor);
    return service.teamAdminDetail(transaction,teamId);
  });
}

module.exports = { recordUntrackedItem };
