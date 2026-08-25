const fs = require("node:fs");
const path = require("node:path");

let databasePromise;

function normalizeResult(result) {
  return {
    rows: result.rows || [],
    rowCount: result.rowCount == null ? (result.affectedRows || 0) : result.rowCount
  };
}

async function createPgliteDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataPath = process.env.CHECKOUT_PGLITE_PATH || "memory://";
  const client = new PGlite(dataPath);

  await client.waitReady;

  return {
    kind: "pglite",
    async exec(text) {
      await client.exec(text);
    },
    async query(text, values) {
      return normalizeResult(await client.query(text, values || []));
    },
    async transaction(callback) {
      return client.transaction(async function (transaction) {
        return callback({
          query: async function (text, values) {
            return normalizeResult(await transaction.query(text, values || []));
          }
        });
      });
    },
    async close() {
      await client.close();
    }
  };
}

async function createPostgresDatabase() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max: 5
  });

  return {
    kind: "postgres",
    async exec(text) {
      await pool.query(text);
    },
    async query(text, values) {
      return normalizeResult(await pool.query(text, values || []));
    },
    async transaction(callback) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await callback({ query: client.query.bind(client) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

async function initializeDatabase() {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the production checkout system.");
  }

  const database = process.env.DATABASE_URL
    ? await createPostgresDatabase()
    : await createPgliteDatabase();
  const schemaPath = path.join(process.cwd(), "db", "checkout-schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  await database.exec(schema);
  return database;
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = initializeDatabase();
  }

  return databasePromise;
}

async function resetDatabaseForTests() {
  if (databasePromise) {
    const database = await databasePromise;
    await database.close();
  }

  databasePromise = undefined;
}

module.exports = { getDatabase, resetDatabaseForTests };
