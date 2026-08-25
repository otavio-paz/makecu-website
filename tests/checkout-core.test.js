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

function request(action, payload, cookie) {
  return new Promise(function (resolve, reject) {
    const headers = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };

    if (cookie) {
      headers.cookie = cookie;
    }

    const incoming = {
      method: "POST",
      headers,
      body: Object.assign({ action }, payload || {}),
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
    imageUrl: "",
    category: "Camera",
    compatibility: "Raspberry Pi",
    totalQuantity: 1,
    unavailableQuantity: 0,
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
  assert.ok(activity.body.activity.some(function (item) { return item.message.indexOf("processed Return") >= 0; }));
});
