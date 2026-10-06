const { getDatabase } = require("../api/_lib/checkout-db");

async function rewriteCheckoutImageUrls(database) {
  return database.transaction(async function (transaction) {
    const updated = await transaction.query(
      `UPDATE checkout_components
          SET image_url = regexp_replace(image_url, '\\.(?:jpe?g|png)$', '.webp', 'i'),
              version = version + 1,
              updated_at = NOW()
        WHERE image_url LIKE '/images/checkout/components/%'
          AND image_url ~* '\\.(?:jpe?g|png)$'
       RETURNING id`
    );

    if (updated.rowCount > 0) {
      const actor = await transaction.query(
        "SELECT id FROM checkout_users WHERE role = 'admin' AND active = TRUE ORDER BY id LIMIT 1"
      );
      await transaction.query(
        `INSERT INTO checkout_activity (actor_user_id, message)
         VALUES ($1, $2)`,
        [actor.rows[0] ? actor.rows[0].id : null,
          `Converted ${updated.rowCount} component image reference${updated.rowCount === 1 ? "" : "s"} to WebP.`]
      );
    }

    return updated.rowCount;
  });
}

async function main() {
  const database = await getDatabase();
  const updated = await rewriteCheckoutImageUrls(database);
  process.stdout.write(`Updated ${updated} checkout image URL${updated === 1 ? "" : "s"} to WebP.\n`);
  await database.close();
}

if (require.main === module) {
  main().catch(function (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { rewriteCheckoutImageUrls };
