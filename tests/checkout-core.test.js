const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.CHECKOUT_FORCE_LIVE = "true";
process.env.CHECKOUT_ADMIN_PASSWORD = "makecu-test-admin-2026";
process.env.CHECKOUT_PGLITE_PATH = "memory://";

const checkoutHandler = require("../api/checkout");
const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { liveStatus } = require("../api/_lib/checkout-live");
const { hashPassword, verifyPassword } = require("../api/_lib/checkout-security");
const { seedCheckout } = require("../api/_lib/checkout-seed");

let requestNumber = 0;

function request(action, payload, cookie) {
  return new Promise(function (resolve, reject) {
    const headers = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };

    if (cookie) {
      headers.cookie = cookie;
    }

    const incoming = {
      method: "POST",
      headers,
      body: Object.assign({ action, idempotencyKey: `test-${++requestNumber}` }, payload || {}),
      query: {}
    };
    const responseHeaders = {};
    const outgoing = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[name.toLowerCase()] = value;
      },
      end(value) {
        try {
          resolve({
            status: this.statusCode,
            headers: responseHeaders,
            body: value ? JSON.parse(value) : null
          });
        } catch (error) {
          reject(error);
        }
      }
    };

    checkoutHandler(incoming, outgoing).catch(reject);
  });
}

async function login(username, password) {
  const response = await request("login", { username, password });
  assert.equal(response.status, 200);
  return response.headers["set-cookie"].split(";")[0];
}

let database;
let adminCookie;

before(async function () {
  database = await getDatabase();
  await seedCheckout(database, { samples: false });
  adminCookie = await login("admin", process.env.CHECKOUT_ADMIN_PASSWORD);
});

after(async function () {
  await resetDatabaseForTests();
});

test("live window is enforced by server configuration", function () {
  assert.equal(liveStatus(new Date("2025-01-01T00:00:00Z")).live, true);
  process.env.CHECKOUT_FORCE_LIVE = "false";
  assert.equal(liveStatus(new Date("2025-01-01T00:00:00Z")).live, false);
  process.env.CHECKOUT_LIVE_START = "2026-11-07T09:00:00-05:00";
  process.env.CHECKOUT_ORDERING_END = "2026-11-08T10:00:00-05:00";
  process.env.CHECKOUT_RETURN_END = "2026-11-08T12:00:00-05:00";
  const returnPeriod = liveStatus(new Date("2026-11-08T11:00:00-05:00"));
  assert.equal(returnPeriod.phase, "return_period");
  assert.equal(returnPeriod.orderingOpen, false);
  assert.equal(returnPeriod.returnsOpen, true);
  process.env.CHECKOUT_FORCE_LIVE = "true";
});

test("password hashes are salted and verifiable", async function () {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
});

test("transactional order, pickup, damaged return, audit, and team isolation flow", async function () {
  const firstTeam = await request("create-team", {
    name: "Byte Builders",
    identifier: "byte-builders",
    username: "byte-builders",
    password: "byte-test-2026"
  }, adminCookie);
  const secondTeam = await request("create-team", {
    name: "Robo Cats",
    identifier: "robo-cats",
    username: "robo-cats",
    password: "robo-test-2026"
  }, adminCookie);
  assert.equal(firstTeam.status, 201);
  assert.equal(secondTeam.status, 201);

  const component = await request("save-component", {
    name: "Last Camera",
    description: "Concurrency test camera",
    imageUrl: "/images/hardware/last-camera.png",
    imageAlt: "Small camera module on a white background",
    binLocation: "Camera bin",
    technicalSpecs: "Requires a Raspberry Pi camera connector.",
    category: "Camera",
    compatibility: "Raspberry Pi",
    totalQuantity: 1,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 1,
    active: true,
    adminNotes: ""
  }, adminCookie);
  assert.equal(component.status, 201);

  const firstCookie = await login("byte-builders", "byte-test-2026");
  const secondCookie = await login("robo-cats", "robo-test-2026");
  const componentId = component.body.component.id;
  const submissions = await Promise.all([
    request("submit-order", { items: [{ componentId, quantity: 1 }] }, firstCookie),
    request("submit-order", { items: [{ componentId, quantity: 1 }] }, secondCookie)
  ]);
  const success = submissions.find(function (response) { return response.status === 201; });
  const conflict = submissions.find(function (response) { return response.status === 409; });
  assert.ok(success);
  assert.ok(conflict);
  assert.match(conflict.body.error, /could not be reserved/i);

  const winnerCookie = success === submissions[0] ? firstCookie : secondCookie;
  const loserCookie = success === submissions[0] ? secondCookie : firstCookie;
  const winnerTeamId = success === submissions[0] ? firstTeam.body.team.id : secondTeam.body.team.id;
  const orderId = success.body.order.id;

  const cooldown = await request("submit-order", { items: [{ componentId, quantity: 1 }] }, winnerCookie);
  assert.equal(cooldown.status, 429);

  const forbiddenOrder = await request("order", { orderId }, loserCookie);
  assert.equal(forbiddenOrder.status, 404);

  assert.equal((await request("claim-order", { orderId }, adminCookie)).status, 200);
  assert.equal((await request("accept-order", { orderId }, adminCookie)).body.order.status, "accepted");
  assert.equal((await request("mark-ready", { orderId }, adminCookie)).body.order.status, "ready");
  assert.equal((await request("confirm-pickup", { orderId }, adminCookie)).body.order.status, "picked_up");
  assert.equal((await request("confirm-pickup", { orderId }, adminCookie)).body.order.status, "picked_up");

  const detailBefore = await request("team-detail", { teamId: winnerTeamId }, adminCookie);
  assert.equal(detailBefore.body.inventory[0].checkedOutQuantity, 1);
  const returned = await request("process-return", {
    teamId: winnerTeamId,
    items: [{ componentId, quantity: 1, condition: "damaged", note: "Lens cracked during demo." }]
  }, adminCookie);
  assert.equal(returned.status, 201);
  assert.equal(returned.body.inventory.length, 0);
  assert.equal(returned.body.returns[0].items[0].condition, "damaged");

  const catalog = await request("catalog", {}, adminCookie);
  const finalComponent = catalog.body.components.find(function (item) { return item.id === componentId; });
  assert.equal(finalComponent.availableQuantity, 0);
  assert.equal(finalComponent.checkedOutQuantity, 0);
  assert.equal(finalComponent.unavailableQuantity, 1);

  const activity = await request("activity", {}, adminCookie);
  assert.ok(activity.body.activity.some(function (item) { return item.message.indexOf("confirmed pickup") >= 0; }));
  assert.ok(activity.body.activity.some(function (item) { return /processed R-\d+/.test(item.message); }));
});

test("same-team simultaneous submissions are serialized", async function () {
  const team = await request("create-team", {
    name: "Parallel Penguins",
    identifier: "parallel-penguins",
    username: "parallel-penguins",
    password: "parallel-test-2026"
  }, adminCookie);
  const firstComponent = await request("save-component", {
    name: "Parallel Sensor A",
    description: "Team locking test",
    imageUrl: "/images/hardware/sensor-a.png",
    imageAlt: "Sensor A board",
    category: "Sensor",
    compatibility: "Arduino",
    binLocation: "Test bin A",
    technicalSpecs: "3.3 V logic",
    totalQuantity: 5,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 5,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const secondComponent = await request("save-component", {
    name: "Parallel Sensor B",
    description: "Team locking test",
    imageUrl: "/images/hardware/sensor-b.png",
    imageAlt: "Sensor B board",
    category: "Sensor",
    compatibility: "Arduino",
    binLocation: "Test bin B",
    technicalSpecs: "5 V logic",
    totalQuantity: 5,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 5,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const cookie = await login("parallel-penguins", "parallel-test-2026");
  const submissions = await Promise.all([
    request("submit-order", {
      idempotencyKey: "parallel-order-a",
      items: [{ componentId: firstComponent.body.component.id, quantity: 1 }]
    }, cookie),
    request("submit-order", {
      idempotencyKey: "parallel-order-b",
      items: [{ componentId: secondComponent.body.component.id, quantity: 1 }]
    }, cookie)
  ]);

  assert.equal(submissions.filter(function (response) { return response.status === 201; }).length, 1);
  assert.equal(submissions.filter(function (response) { return response.status === 429; }).length, 1);
});

test("an idempotency key replays the original order result", async function () {
  const team = await request("create-team", {
    name: "Retry Robots",
    identifier: "retry-robots",
    username: "retry-robots",
    password: "retry-test-2026"
  }, adminCookie);
  const component = await request("save-component", {
    name: "Retry Board",
    description: "Idempotency test",
    imageUrl: "/images/hardware/retry-board.png",
    imageAlt: "Small controller board",
    category: "Microcontroller",
    compatibility: "Arduino",
    binLocation: "Test bin C",
    technicalSpecs: "USB powered",
    totalQuantity: 3,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 3,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const cookie = await login("retry-robots", "retry-test-2026");
  const payload = {
    idempotencyKey: "same-order-request",
    items: [{ componentId: component.body.component.id, quantity: 1 }]
  };
  const first = await request("submit-order", payload, cookie);
  const replay = await request("submit-order", payload, cookie);
  const mismatchedReplay = await request("submit-order", {
    idempotencyKey: "same-order-request",
    items: [{ componentId: component.body.component.id, quantity: 2 }]
  }, cookie);

  assert.equal(first.status, 201);
  assert.equal(replay.status, 201);
  assert.equal(replay.body.order.id, first.body.order.id);
  assert.equal(mismatchedReplay.status, 409);
  assert.match(mismatchedReplay.body.error, /different request/i);

  const catalog = await request("catalog", {}, adminCookie);
  const stored = catalog.body.components.find(function (item) { return item.id === component.body.component.id; });
  assert.equal(stored.reservedQuantity, 1);
});

test("stale component edits are rejected", async function () {
  const created = await request("save-component", {
    name: "Versioned Driver",
    description: "Version conflict test",
    imageUrl: "/images/hardware/versioned-driver.png",
    imageAlt: "Dual motor driver board",
    category: "Motor Related",
    compatibility: "Arduino + Raspberry Pi",
    binLocation: "Driver bin",
    technicalSpecs: "External motor power required.",
    totalQuantity: 8,
    unavailableQuantity: 0,
    protectedStock: 1,
    maxActivePerTeam: 2,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const original = created.body.component;
  const base = {
    id: original.id,
    expectedVersion: original.version,
    name: original.name,
    description: original.description,
    imageUrl: original.imageUrl,
    imageAlt: original.imageAlt,
    category: original.category,
    compatibility: original.compatibility,
    binLocation: original.binLocation,
    technicalSpecs: original.technicalSpecs,
    totalQuantity: original.totalQuantity,
    unavailableQuantity: original.unavailableQuantity,
    protectedStock: original.protectedStock,
    maxActivePerTeam: original.maxActivePerTeam,
    active: true,
    adminNotes: "",
    changeReason: "Physical count verified"
  };
  const first = await request("save-component", Object.assign({}, base, { totalQuantity: 9 }), adminCookie);
  const stale = await request("save-component", Object.assign({}, base, { totalQuantity: 10 }), adminCookie);

  assert.equal(first.status, 200);
  assert.equal(first.body.component.version, original.version + 1);
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /changed since you opened/i);
});

test("only one of three admins can claim an order and an expired claim can be taken over", async function () {
  const password = "volunteer-test-2026";
  const passwordHash = await hashPassword(password);

  for (const username of ["volunteer-two", "volunteer-three"]) {
    await database.query(
      `INSERT INTO checkout_users (username, password_hash, role, display_name)
       VALUES ($1, $2, 'admin', $3)`,
      [username, passwordHash, username]
    );
  }

  const secondAdminCookie = await login("volunteer-two", password);
  const thirdAdminCookie = await login("volunteer-three", password);
  await request("create-team", {
    name: "Claim Testers",
    identifier: "claim-testers",
    username: "claim-testers",
    password: "claim-test-2026"
  }, adminCookie);
  const component = await request("save-component", {
    name: "Claim Test Relay",
    description: "Admin claim test",
    imageUrl: "/images/hardware/claim-relay.png",
    imageAlt: "Blue relay module",
    category: "Electronics",
    compatibility: "Arduino + Raspberry Pi",
    binLocation: "Relay bin",
    technicalSpecs: "Use a logic-safe control input.",
    totalQuantity: 4,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 2,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const teamCookie = await login("claim-testers", "claim-test-2026");
  const order = await request("submit-order", {
    items: [{ componentId: component.body.component.id, quantity: 1 }]
  }, teamCookie);
  const cookies = [adminCookie, secondAdminCookie, thirdAdminCookie];
  const claims = await Promise.all(cookies.map(function (cookie, index) {
    return request("claim-order", {
      idempotencyKey: `claim-race-${index}`,
      orderId: order.body.order.id
    }, cookie);
  }));

  assert.equal(claims.filter(function (response) { return response.status === 200; }).length, 1);
  assert.equal(claims.filter(function (response) { return response.status === 409; }).length, 2);

  const winnerIndex = claims.findIndex(function (response) { return response.status === 200; });
  const takeoverCookie = cookies[(winnerIndex + 1) % cookies.length];
  await database.query(
    "UPDATE checkout_orders SET claim_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
    [order.body.order.id]
  );
  const takeover = await request("claim-order", {
    orderId: order.body.order.id
  }, takeoverCookie);

  assert.equal(takeover.status, 200);
  assert.equal(takeover.body.order.status, "reviewing");
  assert.notEqual(takeover.body.order.reviewedBy, claims[winnerIndex].body.order.reviewedBy);
});

test("pickup and cancellation cannot both win", async function () {
  await request("create-team", {
    name: "Transition Racers",
    identifier: "transition-racers",
    username: "transition-racers",
    password: "transition-test-2026"
  }, adminCookie);
  const component = await request("save-component", {
    name: "Transition Test Motor",
    description: "Pickup versus cancellation test",
    imageUrl: "/images/hardware/transition-motor.png",
    imageAlt: "Small DC motor",
    category: "Motor",
    compatibility: "Arduino + Raspberry Pi",
    binLocation: "Motor test bin",
    technicalSpecs: "Requires a motor driver and external power.",
    totalQuantity: 2,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 2,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const teamCookie = await login("transition-racers", "transition-test-2026");
  const submitted = await request("submit-order", {
    items: [{ componentId: component.body.component.id, quantity: 1 }]
  }, teamCookie);
  const orderId = submitted.body.order.id;

  await request("claim-order", { orderId }, adminCookie);
  await request("accept-order", { orderId }, adminCookie);
  await request("mark-ready", { orderId }, adminCookie);

  const transitions = await Promise.all([
    request("confirm-pickup", { idempotencyKey: "pickup-race", orderId }, adminCookie),
    request("cancel-order", { idempotencyKey: "cancel-race", orderId }, adminCookie)
  ]);

  assert.equal(transitions.filter(function (response) { return response.status === 200; }).length, 1);
  assert.equal(transitions.filter(function (response) { return response.status === 409; }).length, 1);

  const detail = await request("order", { orderId }, adminCookie);
  assert.ok(["picked_up", "cancelled"].includes(detail.body.order.status));
});

test("expired orders release their reservation and keep a receipt", async function () {
  await request("create-team", {
    name: "Expiry Explorers",
    identifier: "expiry-explorers",
    username: "expiry-explorers",
    password: "expiry-test-2026"
  }, adminCookie);
  const component = await request("save-component", {
    name: "Expiry Test Cable",
    description: "Reservation expiry test",
    imageUrl: "/images/hardware/expiry-cable.png",
    imageAlt: "Short USB cable",
    category: "Electronics",
    compatibility: "N/A",
    binLocation: "Cable test bin",
    technicalSpecs: "USB data cable.",
    totalQuantity: 2,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 2,
    active: true,
    adminNotes: ""
  }, adminCookie);
  const teamCookie = await login("expiry-explorers", "expiry-test-2026");
  const submitted = await request("submit-order", {
    items: [{ componentId: component.body.component.id, quantity: 1 }]
  }, teamCookie);

  await database.query(
    "UPDATE checkout_orders SET reservation_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
    [submitted.body.order.id]
  );
  const dashboard = await request("team-dashboard", {}, teamCookie);
  const expired = dashboard.body.orders.find(function (order) { return order.id === submitted.body.order.id; });
  const catalog = await request("catalog", {}, adminCookie);
  const stored = catalog.body.components.find(function (item) { return item.id === component.body.component.id; });

  assert.equal(expired.status, "expired");
  assert.match(expired.receiptCode, /^O-\d{5}$/);
  assert.equal(stored.reservedQuantity, 0);
  assert.equal(stored.availableQuantity, 2);
});
