const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { secureConnectionString } = require('../api/_lib/checkout-db');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Default mode previews; --apply saves the one-hour claim policy.');
  const schema = fs.readFileSync('db/checkout-schema.sql', 'utf8');
  const migration = schema.split('-- BEGIN MINIMUM CLAIM LEASE MIGRATION')[1].split('-- END MINIMUM CLAIM LEASE MIGRATION')[0];
  const client = new Client({ connectionString: secureConnectionString(process.env.DATABASE_URL) });
  try {
    await client.connect();
    await client.query('BEGIN');
    const before = (await client.query(`SELECT id,reviewed_by,claim_expires_at,reservation_expires_at
      FROM checkout_orders WHERE status='reviewing' AND reviewed_by IS NOT NULL ORDER BY id FOR UPDATE`)).rows;
    const apply = process.argv.includes('--apply');
    if (!apply) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ apply:false,assignedReviewClaims:before.length,minimumMinutes:60 }));
      return;
    }
    const history = (await client.query(`SELECT md5(COALESCE(string_agg(md5((to_jsonb(orders)-'claim_expires_at')::text),'' ORDER BY id),'')) AS fingerprint
      FROM checkout_orders orders`)).rows[0].fingerprint;
    const hasMigrations = (await client.query("SELECT to_regclass('checkout_policy_migrations') AS name")).rows[0].name;
    const alreadyApplied = hasMigrations ? (await client.query("SELECT name FROM checkout_policy_migrations WHERE name='minimum-claim-lease-60-minutes-v1'")).rows.length > 0 : false;
    await client.query(migration);
    const after = (await client.query(`SELECT id,reviewed_by,claim_expires_at,reservation_expires_at,
      claim_expires_at >= NOW()+INTERVAL '60 minutes' AS protected
      FROM checkout_orders WHERE status='reviewing' AND reviewed_by IS NOT NULL ORDER BY id`)).rows;
    for (const original of before) {
      const current = after.find(row => row.id === original.id);
      assert.ok(current && (alreadyApplied || current.protected), 'An existing claim did not receive one hour.');
      assert.equal(current.reviewed_by, original.reviewed_by);
      if (original.claim_expires_at) assert.ok(new Date(current.claim_expires_at) >= new Date(original.claim_expires_at), 'A longer lease was shortened.');
      assert.equal(current.reservation_expires_at, null);
    }
    const unchanged = (await client.query(`SELECT md5(COALESCE(string_agg(md5((to_jsonb(orders)-'claim_expires_at')::text),'' ORDER BY id),'')) AS fingerprint
      FROM checkout_orders orders`)).rows[0].fingerprint;
    assert.equal(unchanged, history, 'An order field outside claim expiration changed.');
    await client.query('COMMIT');
    fs.writeFileSync('.checkout-secrets/hour-claims-result.production.local.json', JSON.stringify({appliedAt:new Date().toISOString(),before,after,minimumMinutes:60},null,2));
    console.log(JSON.stringify({ apply:true,minimumMinutes:60,assignedReviewClaims:after.length,orderFieldsPreserved:true,longerLeasesPreserved:true }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
