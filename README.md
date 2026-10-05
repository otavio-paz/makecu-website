# MakeCU 2026 Website

Static Jekyll landing page for MakeCU, Columbia University Robotics Club's 24-hour hardware hackathon on November 7-8, 2026.

The site intentionally keeps unconfirmed items as placeholders: registration, sponsors, exact venue rooms, hardware inventory, prizes, judges, schedule, Discord, and contact email.

## Local Development

```bash
bundle install
bundle exec jekyll serve
```

Open `http://localhost:4000`.

## Hardware Checkout Development

The hardware checkout app uses PostgreSQL in production and a local PGlite database for development.

```bash
npm install
$env:CHECKOUT_FORCE_LIVE="true"
$env:CHECKOUT_ADMIN_PASSWORD="replace-with-a-long-password"
$env:CHECKOUT_PGLITE_PATH="./checkout-dev-data"
npm run checkout:seed
bundle exec jekyll build
npm run checkout:dev
```

Open `http://127.0.0.1:4173/checkout/`. The checkout API fails closed outside the configured event window. Set `CHECKOUT_LIVE_START`, `CHECKOUT_ORDERING_END`, and `CHECKOUT_RETURN_END` in production; `CHECKOUT_FORCE_LIVE` is intended only for local testing.

Run `npm test` for the inventory concurrency, idempotency, authorization, claim lease, stale-edit, pickup/cancel, return, and audit regression tests. Active inventory requires a photo and accessible image description; seeded sample components remain inactive until organizers add and verify those images. See [DEPLOYMENT.md](DEPLOYMENT.md) for production database and event-window configuration.

### Full catalog descriptions and provisional images

The local 2026 inventory preview can be enriched after the catalog has been imported into the checkout database. Set the checkout API URL and an admin account, then run:

```powershell
$env:CHECKOUT_BASE_URL="http://127.0.0.1:4173"
$env:CHECKOUT_ADMIN_USERNAME="admin"
$env:CHECKOUT_ADMIN_PASSWORD="your-local-admin-password"
npm run checkout:enrich-descriptions
npm run checkout:download-images
```

`scripts/checkout-component-sources.json` records the product hyperlinks extracted from `MakeCU Hardware List 2026.xlsx`. The image command downloads only supported raster images exposed by those linked pages, writes them under `images/checkout/components/`, records provenance and failures in `download-manifest.json`, and updates matching catalog records through the normal audited admin API. Treat every downloaded supplier image as provisional: confirm the exact component revision and permission to publish it before production.

## Edit Content

Most event copy lives in `_config.yml`.

Useful files:

- `index.html` - page structure and sections
- `_config.yml` - event details, FAQ, sponsor placeholders, schedule placeholders
- `css/makecu.css` - visual design, gradients, and minimal circuit motifs
- `images/` - favicon and legacy/static image assets
- `DEPLOYMENT.md` - Vercel, MLH, and domain access checklist

## Vercel

This repo includes `vercel.json`:

```json
{
  "installCommand": "bundle install --path vendor/bundle",
  "buildCommand": "bundle exec jekyll build",
  "outputDirectory": "_site"
}
```

Import the GitHub repo into Vercel and use the `mlh-hackathon-boilerplate` folder as the project root if the repository keeps this folder structure.
