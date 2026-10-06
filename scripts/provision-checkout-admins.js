const path = require("node:path");
const { getDatabase } = require("../api/_lib/checkout-db");
const { provisionAdminAccounts } = require("../api/_lib/checkout-admin-provision");

async function main() {
  const database = await getDatabase();
  const credentialsFilename = process.env.CHECKOUT_ADMIN_CREDENTIALS_FILE ||
    (process.env.DATABASE_URL ? "checkout-admin-credentials.production.local.json" : "checkout-admin-credentials.local.json");
  const result = await provisionAdminAccounts(database, {
    credentialsPath: path.join(process.cwd(), credentialsFilename),
    rotate: process.argv.includes("--rotate")
  });

  process.stdout.write(`Provisioned ${result.usernames.join(", ")}.\n`);
  process.stdout.write(`Passwords were written only to ${result.credentialsPath}; they were not printed.\n`);
  await database.close();
}

main().catch(function (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
