const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.CHECKOUT_FORCE_LIVE = "false";
process.env.CHECKOUT_LIVE_START = "2099-11-07T09:00:00-05:00";
process.env.CHECKOUT_ORDERING_END = "2099-11-08T10:00:00-05:00";
process.env.CHECKOUT_RETURN_END = "2099-11-08T12:00:00-05:00";
process.env.CHECKOUT_PGLITE_PATH = "memory://";

const checkoutHandler = require("../api/checkout");
const { getDatabase, resetDatabaseForTests } = require("../api/_lib/checkout-db");
const { hashPassword, hashToken, SESSION_COOKIE } = require("../api/_lib/checkout-security");

let requestNumber = 0;

function request(action, payload, cookie) {
  return new Promise(function (resolve, reject) {
    const headers = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };
    if (cookie) headers.cookie = cookie;
    const outgoingHeaders = {};
    const response = {
      statusCode: 200,
      setHeader(name, value) { outgoingHeaders[name.toLowerCase()] = value; },
      end(value) {
        try {
          resolve({
            status: this.statusCode,
            headers: outgoingHeaders,
            body: value ? JSON.parse(value) : null
          });
        } catch (error) {
          reject(error);
        }
      }
    };
    checkoutHandler({
      method: "POST",
      headers,
      body: Object.assign({ action, idempotencyKey: `closed-window-${++requestNumber}` }, payload || {}),
      query: {}
    }, response).catch(reject);
  });
}

let database;

before(async function () {
  database = await getDatabase();
  const adminHash = await hashPassword("admin-closed-window-password");
  const teamHash = await hashPassword("team-closed-window-password");
  const team = await database.query(
    "INSERT INTO checkout_teams (name, identifier) VALUES ('Closed Team', 'closed-team') RETURNING id"
  );
  await database.query(
    `INSERT INTO checkout_users (username, password_hash, role, display_name, team_id)
     VALUES
       ('closed-admin', $1, 'admin', 'Closed Admin', NULL),
       ('closed-team', $2, 'team', 'Closed Team', $3)`,
    [adminHash, teamHash, team.rows[0].id]
  );
  const teamUser = await database.query("SELECT id FROM checkout_users WHERE username = 'closed-team'");
  await database.query(
    `INSERT INTO checkout_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [hashToken("existing-team-session"), teamUser.rows[0].id]
  );
});

after(async function () {
  await resetDatabaseForTests();
});

test("admins can sign in and manage inventory before the event", async function () {
  const login = await request("login", {
    username: "closed-admin",
    password: "admin-closed-window-password"
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "admin");
  const cookie = login.headers["set-cookie"].split(";")[0];

  const created = await request("save-component", {
    name: "Pre-event Test Component",
    description: "Created by an organizer before the live event window.",
    imageUrl: "/images/checkout-image-pending.svg",
    imageAlt: "Photo pending review for pre-event test component",
    category: "Electronics",
    compatibility: "N/A",
    totalQuantity: 3,
    unavailableQuantity: 0,
    protectedStock: 0,
    maxActivePerTeam: 1,
    active: false,
    adminNotes: "",
    relationships: []
  }, cookie);
  assert.equal(created.status, 201);
  assert.equal((await request("catalog", {}, cookie)).status, 200);
  assert.equal((await request("admin-overview", {}, cookie)).status, 200);
});

test("teams cannot sign in or reuse an existing session before the event", async function () {
  const login = await request("login", {
    username: "closed-team",
    password: "team-closed-window-password"
  });
  assert.equal(login.status, 423);
  assert.equal(login.headers["set-cookie"], undefined);
  assert.match(login.body.error, /only while.*live/i);

  const existingCookie = `${SESSION_COOKIE}=existing-team-session`;
  const catalog = await request("catalog", {}, existingCookie);
  assert.equal(catalog.status, 423);
});
