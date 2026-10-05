const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceManifestPath = path.join(__dirname, "checkout-component-sources.json");
const imageDirectory = path.join(projectRoot, "images", "checkout", "components");
const downloadManifestPath = path.join(imageDirectory, "download-manifest.json");
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36";
const force = process.argv.includes("--force");
const catalogOnly = process.argv.includes("--catalog-only");

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:4173").replace(/\/$/, "");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "component";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function safeRemoteUrl(value, baseUrl) {
  try {
    const resolved = new URL(decodeHtml(value), baseUrl);
    if (!/^https?:$/.test(resolved.protocol)) return null;
    return resolved.href;
  } catch (_error) {
    return null;
  }
}

function addCandidate(candidates, rawUrl, score, baseUrl, reason) {
  const url = safeRemoteUrl(rawUrl, baseUrl);
  if (!url) return;
  if (/\.(?:svg)(?:$|[?#])/i.test(url)) return;
  if (/(?:favicon|sprite|logo|payment|badge|flag|avatar|tracking|pixel|transparent|spacer|loading)/i.test(url) && score < 100) return;
  const existing = candidates.get(url);
  if (!existing || existing.score < score) candidates.set(url, { url, score, reason });
}

function extractImageCandidates(html, pageUrl) {
  const candidates = new Map();

  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = parseAttributes(tag);
    const key = String(attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
    const content = attributes.content;
    if (!content) continue;
    if (["og:image", "og:image:url", "og:image:secure_url"].includes(key)) {
      addCandidate(candidates, content, 130, pageUrl, key);
    } else if (["twitter:image", "twitter:image:src"].includes(key)) {
      addCandidate(candidates, content, 120, pageUrl, key);
    } else if (key === "image") {
      addCandidate(candidates, content, 105, pageUrl, key);
    }
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attributes = parseAttributes(tag);
    if (/\bimage_src\b/i.test(attributes.rel || "")) {
      addCandidate(candidates, attributes.href, 115, pageUrl, "link:image_src");
    }
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const attributes = parseAttributes(tag);
    const descriptor = `${attributes.id || ""} ${attributes.class || ""} ${attributes.alt || ""}`;
    const score = /product|primary|main|landing|hero/i.test(descriptor) ? 95 : 35;
    addCandidate(candidates, attributes["data-old-hires"], score + 10, pageUrl, "img:data-old-hires");
    addCandidate(candidates, attributes["data-src"], score, pageUrl, "img:data-src");
    addCandidate(candidates, attributes.src, score, pageUrl, "img:src");
    if (attributes["data-a-dynamic-image"]) {
      try {
        const images = JSON.parse(attributes["data-a-dynamic-image"]);
        for (const imageUrl of Object.keys(images)) addCandidate(candidates, imageUrl, 125, pageUrl, "amazon:dynamic-image");
      } catch (_error) {
        // Ignore malformed vendor markup and continue with the other candidates.
      }
    }
  }

  const jsonPatterns = [
    [/"hiRes"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/gi, 128, "json:hiRes"],
    [/"mainUrl"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/gi, 122, "json:mainUrl"],
    [/"large"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/gi, 118, "json:large"]
  ];
  for (const [pattern, score, reason] of jsonPatterns) {
    let match;
    while ((match = pattern.exec(html))) {
      addCandidate(candidates, match[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&"), score, pageUrl, reason);
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

async function fetchWithTimeout(url, options = {}) {
  const response = await fetch(url, Object.assign({
    redirect: "follow",
    signal: AbortSignal.timeout(18_000),
    headers: {
      "user-agent": userAgent,
      "accept-language": "en-US,en;q=0.9"
    }
  }, options));
  return response;
}

function imageType(bytes, contentType) {
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (type === "image/jpeg" || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return { extension: "jpg", mimeType: "image/jpeg" };
  if (type === "image/png" || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return { extension: "png", mimeType: "image/png" };
  if (type === "image/webp" || (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) return { extension: "webp", mimeType: "image/webp" };
  if (type === "image/gif" || bytes.subarray(0, 3).toString("ascii") === "GIF") return { extension: "gif", mimeType: "image/gif" };
  return null;
}

async function downloadCandidate(candidate, productUrl) {
  const response = await fetchWithTimeout(candidate.url, {
    headers: {
      "user-agent": userAgent,
      "accept-language": "en-US,en;q=0.9",
      accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/gif,*/*;q=0.5",
      referer: productUrl
    }
  });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const announcedLength = Number(response.headers.get("content-length") || 0);
  if (announcedLength > 8_000_000) throw new Error("image exceeds 8 MB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4_096) throw new Error("image is too small to be a useful product photo");
  if (bytes.length > 8_000_000) throw new Error("image exceeds 8 MB");
  const type = imageType(bytes, response.headers.get("content-type"));
  if (!type) throw new Error("response is not a supported raster image");
  return { bytes, type, finalUrl: response.url };
}

async function downloadProductImage(source) {
  if (/\.pdf(?:$|[?#])/i.test(source.productUrl)) {
    return { status: "skipped", error: "The source link is a PDF datasheet, not a product page with a photo." };
  }

  const pageResponse = await fetchWithTimeout(source.productUrl, {
    headers: {
      "user-agent": userAgent,
      "accept-language": "en-US,en;q=0.9",
      accept: "text/html,application/xhtml+xml"
    }
  });
  if (!pageResponse.ok) throw new Error(`product page HTTP ${pageResponse.status}`);
  const contentType = String(pageResponse.headers.get("content-type") || "");
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`product page returned ${contentType || "an unknown content type"}`);
  }
  const html = await pageResponse.text();
  if (html.length > 8_000_000) throw new Error("product page exceeds the 8 MB parser limit");
  const candidates = extractImageCandidates(html, pageResponse.url);
  if (!candidates.length) throw new Error("no product-image candidates were found on the linked page");

  const failures = [];
  for (const candidate of candidates.slice(0, 16)) {
    try {
      const image = await downloadCandidate(candidate, pageResponse.url);
      const checksum = crypto.createHash("sha256").update(image.bytes).digest("hex");
      const fileName = `${slugify(source.name)}-${checksum.slice(0, 10)}.${image.type.extension}`;
      const absolutePath = path.join(imageDirectory, fileName);
      await fs.writeFile(absolutePath, image.bytes);
      return {
        status: "downloaded",
        sourcePage: pageResponse.url,
        sourceImage: image.finalUrl,
        localImage: `/images/checkout/components/${fileName}`,
        mimeType: image.type.mimeType,
        bytes: image.bytes.length,
        sha256: checksum,
        candidateReason: candidate.reason
      };
    } catch (error) {
      failures.push(`${candidate.reason}: ${error.message}`);
    }
  }
  throw new Error(`no usable raster image downloaded (${failures.slice(0, 3).join("; ")})`);
}

async function loadExistingManifest() {
  try {
    return JSON.parse(await fs.readFile(downloadManifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { generatedAt: null, items: [] };
    throw error;
  }
}

async function findExistingDownload(source) {
  const prefix = `${slugify(source.name)}-`;
  const entries = await fs.readdir(imageDirectory, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && entry.name.startsWith(prefix) && /\.(?:jpe?g|png|webp|gif)$/i.test(entry.name));
  if (!match) return null;
  const bytes = await fs.readFile(path.join(imageDirectory, match.name));
  return Object.assign({}, source, {
    status: "downloaded",
    sourcePage: source.productUrl,
    sourceImage: null,
    localImage: `/images/checkout/components/${match.name}`,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    candidateReason: "recovered-from-previous-download"
  });
}

async function updateCatalog(results) {
  const username = process.env.CHECKOUT_ADMIN_USERNAME;
  const password = process.env.CHECKOUT_ADMIN_PASSWORD;
  if (!username || !password) return { updated: 0, skipped: results.filter((item) => item.status === "downloaded").length, reason: "Admin credentials were not provided." };

  const baseUrl = normalizeBaseUrl(process.env.CHECKOUT_BASE_URL);
  let cookie = "";
  async function post(body) {
    const response = await fetch(`${baseUrl}/api/checkout`, {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, cookie ? { cookie } : {}),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    const payload = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${payload.error || "Checkout API request failed"}`);
    return payload;
  }

  await post({ action: "login", username, password });
  const catalog = await post({ action: "catalog" });
  const components = new Map(catalog.components.map((component) => [component.name.toLocaleLowerCase("en-US"), component]));
  let updated = 0;
  let skipped = 0;

  for (const result of results.filter((item) => item.status === "downloaded")) {
    const component = components.get(result.name.toLocaleLowerCase("en-US"));
    if (!component) {
      result.catalogStatus = "component-not-found";
      skipped += 1;
      continue;
    }
    if (component.imageUrl === result.localImage) {
      result.catalogStatus = "already-current";
      skipped += 1;
      continue;
    }
    await post({
      action: "save-component",
      idempotencyKey: crypto.randomUUID(),
      id: component.id,
      expectedVersion: component.version,
      name: component.name,
      description: component.description,
      imageUrl: result.localImage,
      imageAlt: `Product photo of ${component.name} from the linked supplier page`,
      category: component.category,
      compatibility: component.compatibility,
      binLocation: component.binLocation,
      technicalSpecs: component.technicalSpecs,
      totalQuantity: component.totalQuantity,
      unavailableQuantity: component.unavailableQuantity,
      protectedStock: component.protectedStock,
      maxActivePerTeam: component.maxActivePerTeam,
      active: component.active,
      adminNotes: component.adminNotes,
      changeReason: `Added a provisional product image downloaded from spreadsheet source row ${result.sourceRow}.`
    });
    component.version += 1;
    component.imageUrl = result.localImage;
    result.catalogStatus = "updated";
    updated += 1;
  }
  return { updated, skipped, baseUrl };
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, consume));
  return results;
}

async function main() {
  await fs.mkdir(imageDirectory, { recursive: true });
  const sourceManifest = JSON.parse(await fs.readFile(sourceManifestPath, "utf8"));
  const existingManifest = await loadExistingManifest();
  const existingByName = new Map((existingManifest.items || []).map((item) => [item.name, item]));

  const results = await runPool(sourceManifest.items, async (source, index) => {
    const existing = existingByName.get(source.name);
    if (catalogOnly && existing) {
      process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] reused ${source.name}\n`);
      return Object.assign({}, existing, source);
    }
    if (!force && existing?.status === "downloaded" && existing.localImage) {
      try {
        await fs.access(path.join(projectRoot, existing.localImage.replace(/^\//, "")));
        process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] kept ${source.name}\n`);
        return Object.assign({}, existing, source);
      } catch (_error) {
        // The manifest is stale; fetch the image again.
      }
    }

    if (!force) {
      const recovered = await findExistingDownload(source);
      if (recovered) {
        process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] recovered ${source.name}\n`);
        return recovered;
      }
    }

    if (catalogOnly) {
      process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] no prior download ${source.name}\n`);
      return Object.assign({}, source, { status: "failed", error: "No prior download is available." });
    }

    try {
      const downloaded = await downloadProductImage(source);
      process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] ${downloaded.status} ${source.name}\n`);
      return Object.assign({}, source, downloaded);
    } catch (error) {
      process.stdout.write(`[${index + 1}/${sourceManifest.items.length}] failed ${source.name}: ${error.message}\n`);
      return Object.assign({}, source, { status: "failed", error: error.message });
    }
  }, 4);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: sourceManifest.generatedFrom,
    sourceSheet: sourceManifest.sheet,
    summary: {
      linkedComponents: results.length,
      downloaded: results.filter((item) => item.status === "downloaded").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      catalogUpdated: 0,
      catalogSkipped: 0
    },
    items: results
  };
  await fs.writeFile(downloadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const catalog = await updateCatalog(results);
  manifest.summary.catalogUpdated = catalog.updated;
  manifest.summary.catalogSkipped = catalog.skipped;
  manifest.summary.catalogCurrent = results.filter((item) =>
    item.status === "downloaded" && ["updated", "already-current"].includes(item.catalogStatus)
  ).length;
  manifest.catalog = catalog;
  await fs.writeFile(downloadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(manifest.summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
