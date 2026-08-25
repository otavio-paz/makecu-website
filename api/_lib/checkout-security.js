const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "makecu_checkout_session";

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const derived = Buffer.from(await scrypt(String(password), parts[1], 64));
  const expected = Buffer.from(parts[2], "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .reduce(function (cookies, part) {
      const separator = part.indexOf("=");

      if (separator > 0) {
        cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
      }

      return cookies;
    }, {});
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  newSessionToken,
  hashToken,
  parseCookies,
  sessionCookie
};
