const { getDatabase } = require("../api/_lib/checkout-db");
const { seedCheckout } = require("../api/_lib/checkout-seed");

async function main() {
  const database = await getDatabase();
  const result = await seedCheckout(database, { samples: process.env.CHECKOUT_SEED_SAMPLES !== "false" });
  process.stdout.write(`Checkout seeded for ${result.username} with ${result.componentCount} sample components.\n`);
  await database.close();
}

main().catch(function (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
