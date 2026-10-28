const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { WISHLIST_COMPONENTS, WISHLIST_UPDATES } = require("../scripts/apply-wishlist-catalog");

const projectRoot = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "db", "checkout-catalog.json"), "utf8"));
const byName = new Map(catalog.components.map(function (item) { return [item.name, item]; }));
const expected = new Map([
  ...WISHLIST_COMPONENTS.map(function (item) { return [item.name, item.totalQuantity]; }),
  ...WISHLIST_UPDATES.map(function (item) { return [item.name, item.finalQuantity]; })
]);

test("wishlist components use explicit labels, piece-level quantities, and local product photos", function () {
  assert.equal(expected.size, 30);

  for (const [name, quantity] of expected) {
    const item = byName.get(name);
    assert.ok(item, name);
    assert.equal(item.totalQuantity, quantity, `${name} quantity`);
    assert.notEqual(item.imageUrl, "/images/checkout-image-pending.svg", `${name} image`);
    assert.match(item.imageUrl, /^\/images\/checkout\/components\/[^/]+\.webp$/i, `${name} image URL`);
    assert.match(item.imageAlt, /^Product photo of .+ from the linked supplier page$/, `${name} image alt`);
    assert.ok(item.description.length >= 80, `${name} description`);
    assert.ok(item.technicalSpecs.length >= 30, `${name} technical specs`);

    const fileName = path.basename(item.imageUrl);
    assert.equal(fs.existsSync(path.join(projectRoot, "images", "checkout", "components", fileName)), true, fileName);
    assert.equal(fs.existsSync(path.join(projectRoot, "images", "checkout", "components", "thumbnails", fileName)), true, `thumbnail ${fileName}`);
  }
});

test("wishlist consolidation preserves distinct sensor technologies", function () {
  assert.equal(byName.get("MAX30102 Pulse Oximeter (Heart Rate + SpO₂)").totalQuantity, 13);
  assert.equal(byName.get("Analog Pulse Sensor").totalQuantity, 6);
  assert.equal(byName.has("Heart Rate Sensor"), false);
  assert.equal(byName.has("ESP (Wifi + Bluetooth) with Camera"), false);
});
