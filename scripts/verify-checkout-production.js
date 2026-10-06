const fs = require("node:fs");
const path = require("node:path");
const { getDatabase } = require("../api/_lib/checkout-db");
const { verifyPassword } = require("../api/_lib/checkout-security");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const credentialsFilename = process.env.CHECKOUT_ADMIN_CREDENTIALS_FILE ||
    "checkout-admin-credentials.production.local.json";
  const credentialsPath = path.resolve(credentialsFilename);
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8")).accounts;
  const database = await getDatabase();
  const users = await database.query(
    "SELECT username, password_hash, role, active, team_id FROM checkout_users WHERE username = ANY($1) ORDER BY username",
    [credentials.map(function (credential) { return credential.username; })]
  );
  const hashesVerified = [];

  for (const user of users.rows) {
    const credential = credentials.find(function (item) { return item.username === user.username; });
    hashesVerified.push(Boolean(credential) &&
      user.role === "admin" &&
      user.active === true &&
      user.team_id == null &&
      await verifyPassword(credential.password, user.password_hash));
  }

  const inventory = await database.query("SELECT COUNT(*) AS count FROM checkout_components");
  process.stdout.write(`${JSON.stringify({
    admins: users.rows.map(function (user) {
      return { username: user.username, role: user.role, active: user.active, teamId: user.team_id };
    }),
    passwordHashesVerified: users.rows.length === credentials.length && hashesVerified.every(Boolean),
    componentCount: Number(inventory.rows[0].count)
  })}\n`);
  await database.close();
}

main().catch(function (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
