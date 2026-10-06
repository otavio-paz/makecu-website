const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const trackedResult = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
if (trackedResult.status !== 0) {
  throw new Error("Could not list tracked files.");
}
const tracked = trackedResult.stdout.toString("utf8").split("\0").filter(Boolean);
const forbiddenTrackedNames = tracked.filter(function (name) {
  return (/(^|\/)\.env(?:\.|$)/.test(name) && name !== ".env.checkout.example") ||
    /checkout-admin-credentials.*\.local\.json$/i.test(name);
});
if (forbiddenTrackedNames.length) {
  throw new Error(`Secret-bearing local files are tracked: ${forbiddenTrackedNames.join(", ")}`);
}

const secretValues = [];
for (const filename of [".env.production.local", "checkout-admin-credentials.production.local.json"]) {
  const fullPath = path.join(root, filename);
  if (!fs.existsSync(fullPath)) continue;
  if (filename.startsWith(".env")) {
    fs.readFileSync(fullPath, "utf8").split(/\r?\n/).forEach(function (line) {
      const separator = line.indexOf("=");
      if (separator >= 0 && line.slice(separator + 1).trim()) secretValues.push(line.slice(separator + 1).trim());
    });
  } else {
    const credentials = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    (credentials.accounts || []).forEach(function (account) { secretValues.push(account.password); });
  }
}

for (const name of tracked) {
  const trackedPath = path.join(root, name);
  if (!fs.existsSync(trackedPath)) continue;
  const contents = fs.readFileSync(trackedPath);
  for (const secret of secretValues) {
    if (secret && contents.includes(Buffer.from(secret))) {
      throw new Error(`A local production secret appears in tracked file ${name}.`);
    }
  }
  if (/\.html$/i.test(name) && name !== "checkout.html") {
    const html = contents.toString("utf8");
    if (/href\s*=\s*["'][^"']*(?:\/checkout\/|checkout\.html)/i.test(html)) {
      throw new Error(`Checkout is linked from ${name}; it must remain direct-URL only.`);
    }
  }
}

const site = path.join(root, "_site");
if (!fs.existsSync(site)) {
  throw new Error("_site is missing. Run the production build before the release check.");
}
const forbiddenOutput = [
  "checkout-dev-data",
  "checkout-preview-data",
  "checkout-catalog-preview-data",
  "checkout-legacy-restore",
  "checkout-legacy-data.zip",
  "checkout-preview.log",
  "checkout-preview-error.log",
  "images/icons/leaf.psd",
  "images/icons/lightbulb.psd",
  "images/mascots/mascots.psd",
  "images/checkout/components/download-manifest.json"
];
for (const name of forbiddenOutput) {
  if (fs.existsSync(path.join(site, name))) {
    throw new Error(`Source-only artifact was published to _site: ${name}`);
  }
}

function directoryBytes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (total, entry) {
    const fullPath = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? directoryBytes(fullPath) : fs.statSync(fullPath).size);
  }, 0);
}

const outputBytes = directoryBytes(site);
if (outputBytes >= 100 * 1024 * 1024) {
  throw new Error(`Built site is ${outputBytes} bytes, at or above Vercel's 100 MiB static upload limit.`);
}

process.stdout.write(`${JSON.stringify({
  trackedFiles: tracked.length,
  directUrlOnly: true,
  productionSecretsTracked: false,
  outputBytes,
  outputMiB: Number((outputBytes / 1024 / 1024).toFixed(2))
})}\n`);
