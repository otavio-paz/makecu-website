const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { hashPassword } = require("./checkout-security");

const ADMIN_ACCOUNTS = [1, 2, 3, 4].map(function (number) {
  return {
    username: `admin-${number}`,
    displayName: `MakeCU Admin ${number}`
  };
});

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

function readCredentialFile(credentialsPath) {
  if (!fs.existsSync(credentialsPath)) {
    return null;
  }

  const value = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  if (!value || !Array.isArray(value.accounts)) {
    throw new Error("The local admin credential file is not valid JSON in the expected format.");
  }
  return value;
}

async function provisionAdminAccounts(database, options) {
  const settings = options || {};
  const credentialsPath = path.resolve(settings.credentialsPath || "checkout-admin-credentials.local.json");
  const rotate = settings.rotate === true;
  const existingFile = readCredentialFile(credentialsPath);
  const existingRows = await database.query(
    "SELECT username, role FROM checkout_users WHERE username = ANY($1)",
    [ADMIN_ACCOUNTS.map(function (account) { return account.username; })]
  );
  const conflictingUsers = existingRows.rows.filter(function (row) { return row.role !== "admin"; });
  if (conflictingUsers.length) {
    throw new Error(`Cannot provision admin accounts because ${conflictingUsers.map(function (row) { return row.username; }).join(", ")} already belongs to a team. Rename that team login first.`);
  }
  const existingUsers = new Set(existingRows.rows.map(function (row) { return row.username; }));
  const savedCredentials = new Map((existingFile ? existingFile.accounts : []).map(function (account) {
    return [account.username, account];
  }));

  if (!rotate) {
    const unrecoverable = ADMIN_ACCOUNTS.filter(function (account) {
      return existingUsers.has(account.username) && !savedCredentials.has(account.username);
    });

    if (unrecoverable.length) {
      throw new Error(`Credentials for ${unrecoverable.map(function (account) { return account.username; }).join(", ")} already exist in the database but are not in the local credential file. Re-run with --rotate to replace all four passwords.`);
    }
  }

  const credentials = [];
  for (const account of ADMIN_ACCOUNTS) {
    const saved = !rotate && savedCredentials.get(account.username);
    if (saved && existingUsers.has(account.username)) {
      credentials.push(saved);
      continue;
    }

    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    await database.query(
      `INSERT INTO checkout_users (username, password_hash, role, display_name, team_id, active)
       VALUES ($1, $2, 'admin', $3, NULL, TRUE)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = 'admin',
             display_name = EXCLUDED.display_name,
             team_id = NULL,
             active = TRUE`,
      [account.username, passwordHash, account.displayName]
    );
    credentials.push({
      username: account.username,
      password,
      displayName: account.displayName
    });
  }

  await database.query(
    "UPDATE checkout_users SET active = FALSE WHERE username = 'admin' AND role = 'admin'"
  );

  const output = {
    generatedAt: existingFile && !rotate ? existingFile.generatedAt : new Date().toISOString(),
    warning: "Local secret file. Do not commit, publish, email, or share broadly. Rotate a password if it is exposed.",
    accounts: credentials
  };
  fs.writeFileSync(credentialsPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  return {
    credentialsPath,
    usernames: ADMIN_ACCOUNTS.map(function (account) { return account.username; }),
    rotated: rotate
  };
}

module.exports = { ADMIN_ACCOUNTS, provisionAdminAccounts, randomPassword };
