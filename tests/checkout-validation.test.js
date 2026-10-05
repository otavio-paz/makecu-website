const assert = require("node:assert/strict");
const test = require("node:test");

const { componentInput, returnInput } = require("../api/_lib/checkout-validation");

function validComponent(overrides) {
  return Object.assign({
    name: "Arduino Uno",
    description: "Microcontroller",
    imageUrl: "/images/hardware/arduino.png",
    imageAlt: "Arduino Uno board",
    category: "Microcontroller",
    compatibility: "Arduino",
    binLocation: "Cabinet A / Drawer 1",
    technicalSpecs: "USB powered for basic use.",
    totalQuantity: 10,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 2,
    active: true,
    adminNotes: ""
  }, overrides || {});
}

test("component validation accepts site-relative and HTTPS photos", function () {
  assert.equal(componentInput(validComponent()).imageUrl, "/images/hardware/arduino.png");
  assert.equal(componentInput(validComponent({ imageUrl: "https://example.com/arduino.png" })).imageUrl, "https://example.com/arduino.png");
});

test("component validation rejects executable photo URLs", function () {
  assert.throws(function () {
    componentInput(validComponent({ imageUrl: "javascript:alert(1)" }));
  }, /must use http/i);
});

test("active components require an image and accessible description", function () {
  assert.throws(function () {
    componentInput(validComponent({ imageUrl: "", imageAlt: "" }));
  }, /active component requires/i);
  assert.equal(componentInput(validComponent({ imageUrl: "", imageAlt: "", active: false })).active, false);
});

test("damaged and missing returns require an accountability note", function () {
  assert.throws(function () {
    returnInput({ componentId: 1, quantity: 1, condition: "damaged", note: "" });
  }, /note is required/i);
  assert.equal(returnInput({ componentId: 1, quantity: 1, condition: "missing", note: "Lost at demo table" }).condition, "missing");
});
