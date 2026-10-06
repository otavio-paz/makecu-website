const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

process.env.CHECKOUT_PGLITE_PATH = "memory://";

const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { ADMIN_ACCOUNTS, provisionAdminAccounts } = require("../api/_lib/checkout-admin-provision");
const { verifyPassword } = require("../api/_lib/checkout-security");

let database;
let directory;
let credentialsPath;

before(async function () {
  database = await getDatabase();
  await database.query(
    "INSERT INTO checkout_users (username, password_hash, role, display_name) VALUES ('admin', 'legacy-hash', 'admin', 'Legacy Admin')"
  );
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "makecu-admin-provision-"));
  credentialsPath = path.join(directory, "credentials.json");
});

after(async function () {
  await resetDatabaseForTests();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("provisions four distinct admin accounts without storing plaintext passwords in the database", async function () {
  const result = await provisionAdminAccounts(database, { credentialsPath });
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const rows = await database.query(
    "SELECT username, password_hash, role, team_id FROM checkout_users WHERE username = ANY($1) ORDER BY username",
    [ADMIN_ACCOUNTS.map(function (account) { return account.username; })]
  );

  assert.deepEqual(result.usernames, ["admin-1", "admin-2", "admin-3", "admin-4"]);
  assert.equal(credentials.accounts.length, 4);
  assert.equal(new Set(credentials.accounts.map(function (account) { return account.password; })).size, 4);
  assert.ok(credentials.accounts.every(function (account) { return account.password.length >= 30; }));
  assert.equal(rows.rows.length, 4);
  const legacy = await database.query("SELECT active FROM checkout_users WHERE username = 'admin'");
  assert.equal(legacy.rows[0].active, false);

  for (const row of rows.rows) {
    const credential = credentials.accounts.find(function (account) { return account.username === row.username; });
    assert.equal(row.role, "admin");
    assert.equal(row.team_id, null);
    assert.notEqual(row.password_hash, credential.password);
    assert.equal(await verifyPassword(credential.password, row.password_hash), true);
  }
});

test("re-running provisioning preserves existing passwords unless rotation is explicit", async function () {
  const before = fs.readFileSync(credentialsPath, "utf8");
  await provisionAdminAccounts(database, { credentialsPath });
  const after = fs.readFileSync(credentialsPath, "utf8");
  assert.equal(after, before);
});
