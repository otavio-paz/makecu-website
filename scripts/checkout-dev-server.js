const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const checkoutHandler = require("../api/checkout");

const port = Number(process.env.PORT || 4173);
const siteDirectory = path.join(process.cwd(), "_site");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function staticPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const relative = clean.endsWith("/") ? `${clean}index.html` : clean;
  const roots = [siteDirectory];

  // Jekyll copies images into _site for deployment. During catalog work, serve
  // newly downloaded source images immediately so a full Ruby build is not
  // required after every asset review.
  if (clean.startsWith("/images/")) roots.push(process.cwd());

  for (const root of roots) {
    const resolved = path.resolve(root, `.${relative}`);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) continue;

    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }

    if (!path.extname(resolved) && fs.existsSync(`${resolved}.html`)) {
      return `${resolved}.html`;
    }
  }

  return null;
}

const server = http.createServer(async function (request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  request.query = Object.fromEntries(url.searchParams.entries());

  if (url.pathname === "/api/checkout") {
    await checkoutHandler(request, response);
    return;
  }

  const filePath = staticPath(url.pathname);

  if (!filePath) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  response.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", function () {
  process.stdout.write(`MakeCU checkout is running at http://127.0.0.1:${port}/checkout/\n`);
});
