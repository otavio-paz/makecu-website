const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
async function pauseTiming(database){
  return database.transaction(async tx=>{
    const actor=(await tx.query("SELECT id FROM checkout_users WHERE active=TRUE AND role='admin' ORDER BY id LIMIT 1")).rows[0];
    if(!actor)throw new Error('Active admin required.');
    const pause=(await tx.query("INSERT INTO checkout_timing_controls(singleton,paused_until) VALUES(TRUE,NOW()+INTERVAL '2 hours') ON CONFLICT(singleton) DO UPDATE SET paused_until=EXCLUDED.paused_until RETURNING paused_until")).rows[0];
    const claims=await tx.query("UPDATE checkout_orders SET claim_expires_at=GREATEST(claim_expires_at,$1) WHERE status='reviewing' AND claim_expires_at IS NOT NULL",[pause.paused_until]);
    const overrides=await tx.query("INSERT INTO checkout_order_cooldown_overrides(team_id,granted_by,reason,expires_at) SELECT id,$1,'Temporary organizer timing pause',$2 FROM checkout_teams",[actor.id,pause.paused_until]);
    await tx.query('INSERT INTO checkout_activity(actor_user_id,message) VALUES($1,$2)',[actor.id,`Paused order cooldowns and volunteer claim timeouts until ${new Date(pause.paused_until).toISOString()}. Order reservation expiration remains disabled.`]);
    return {pausedUntil:pause.paused_until,extendedClaims:claims.rowCount,teamsWithoutCooldown:overrides.rowCount};
  });
}
if(require.main===module)(async()=>{if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');try{console.log(JSON.stringify(await pauseTiming(await getDatabase())));}finally{await resetDatabaseForTests();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={pauseTiming};
