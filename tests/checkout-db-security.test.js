const assert = require("node:assert/strict");
const { test } = require("node:test");
const { secureConnectionString } = require("../api/_lib/checkout-db");

test("PostgreSQL connection strings require full certificate verification", function () {
  assert.equal(
    secureConnectionString("postgresql://example.test/db?sslmode=require&channel_binding=require"),
    "postgresql://example.test/db?sslmode=verify-full&channel_binding=require"
  );
  assert.equal(
    secureConnectionString("postgresql://example.test/db?connect_timeout=10&sslmode=verify-ca"),
    "postgresql://example.test/db?connect_timeout=10&sslmode=verify-full"
  );
  assert.equal(
    secureConnectionString("postgresql://example.test/db?sslmode=verify-full"),
    "postgresql://example.test/db?sslmode=verify-full"
  );
});
