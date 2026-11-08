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
npm run checkout:provision-admins
bundle exec jekyll build
npm run checkout:dev
```

Open `http://127.0.0.1:4173/checkout/`. `checkout:provision-admins` creates `admin-1` through `admin-15` with independent random passwords and deactivates the legacy generic `admin` login. Admin 1 starts as **Otavio Paz**. The plaintext passwords are written only to the ignored and build-excluded `checkout-admin-credentials.local.json` file; the database stores salted scrypt hashes. Re-running the command preserves passwords and names changed by account holders; `npm run checkout:provision-admins -- --rotate` explicitly rotates all 15 passwords and revokes their sessions.

Run `npm run checkout:provision-accounts` to provision all 15 admins and 40 numbered teams (`team-1` through `team-40`) in a persistent database. Every team password includes `makecu`, `6767`, `robot`, `Columbia`, special characters, a funny phrase, and a random suffix. Re-running preserves existing passwords, chosen account names, and rosters. Credentials are handed off in `.checkout-secrets/checkout-account-credentials.local.md`, or `.checkout-secrets/checkout-account-credentials.production.local.md` when `DATABASE_URL` is set. The hidden `.checkout-secrets/` directory holds the handoff and team credential JSON files, is ignored by Git, and is excluded from the website build even by previews started with an older exclusion list.

Each account can change its display name once using **Change name (once)**. Login usernames stay fixed, and Activity records the old and new names. In **Teams / Returns**, only admins can edit each team's four optional member names and contact email. Profile edits are audited and reject stale versions so two admins cannot silently overwrite one another.

Outside the configured event window, team accounts cannot sign in or use checkout data. Admin accounts may still sign in from the closed screen to rehearse the workflow and maintain inventory; every bypass is enforced from the user's server-side database role. Set `CHECKOUT_LIVE_START`, `CHECKOUT_ORDERING_END`, and `CHECKOUT_RETURN_END` in production; `CHECKOUT_FORCE_LIVE` is intended only for local testing.

Team ordering stays open through the return window. An earlier
`CHECKOUT_ORDERING_END` no longer closes ordering while returns remain open;
the effective ordering deadline is the later of the ordering and return deadlines.
The event start and return deadline still apply, and inventory limits, team
cooldowns, and authorization checks remain enforced.

Team orders are limited to 10 distinct components. The interval before the next order scales linearly with the latest order's distinct component count: 10 minutes for 1 component through 60 minutes for 10, rounded up to whole minutes (10, 16, 22, 27, 33, 38, 44, 49, 55, 60). Multiple units of the same component count once. The interval starts at successful submission, including for existing orders. An admin can grant an audited exception that expires with that order's timeout and is consumed by the team's next successful order. Orders remain reserved until pickup or cancellation, without automatic expiration. Volunteer claim leases remain separate from the order reservation. Motor-driver relationships are displayed as warnings and do not block checkout.

Organizers can temporarily pause order cooldowns and volunteer claim timeouts with
`node scripts/pause-order-timing.js` against the intended production database.
Each explicit invocation starts a two-hour pause. The database stores its end
time, so cooldowns resume automatically without a scheduled job or redeployment.
Automatic order reservation expiration remains disabled after the pause.

Teams receive in-page notifications when their order status changes, detected by
the five-second refresh. Updates remain in the team-only Order updates panel
until dismissed and survive reloads in the same browser session. The first visit
establishes a baseline without alerting on existing order history. Status alerts
are isolated by team login and are not shown to volunteers.

The admin order board lists the oldest submissions first within each stage, with
order ID breaking timestamp ties. Submitted orders are shared; reviewing,
accepted, and ready orders appear only for their assigned admin. The authenticated
`admin-1` account (Otavio Paz) can see the entire board regardless of its current
display name. Released claims return to the shared queue, and expired or missing
review claim leases are visible to everyone for takeover. Completed orders remain
shared history. Team history, returns, reports, and existing action permissions
remain available as before. Board visibility refreshes with the five-second poll.

Volunteer review claims last at least 60 minutes. Claiming, renewing, or saving
adjustments grants at least another hour and preserves any longer existing lease
or organizer pause. A database trigger also protects claims written by older API
workers. The policy migration extends existing assigned reviews once; normal
database initialization does not repeatedly renew claims. Order reservations
remain non-expiring, independent of the review lease.

Run `npm test` for the 40-team load case, same-team multi-session serialization, inventory concurrency, idempotency, authorization, login throttling, request-size/origin hardening, admin provisioning, claim lease, stale-edit, pickup/cancel, return, and audit regression tests. Active inventory requires a photo and accessible image description; seeded sample components remain inactive until organizers add and verify those images. See [DEPLOYMENT.md](DEPLOYMENT.md) for production database and event-window configuration.

### Full catalog descriptions and provisional images

The local 2026 inventory preview can be enriched after the catalog has been imported into the checkout database. Set the checkout API URL and an admin account, then run:

```powershell
$env:CHECKOUT_BASE_URL="http://127.0.0.1:4173"
$env:CHECKOUT_ADMIN_USERNAME="admin"
$env:CHECKOUT_ADMIN_PASSWORD="your-local-admin-password"
npm run checkout:enrich-descriptions
npm run checkout:download-images
npm run checkout:optimize-images
$env:CHECKOUT_PGLITE_PATH="./checkout-catalog-preview-data"
npm run checkout:rewrite-image-urls
npm run checkout:export-catalog
npm run checkout:import-catalog
```

`scripts/checkout-component-sources.json` records the product hyperlinks extracted from `MakeCU Hardware List 2026.xlsx`. The image command downloads only supported raster images exposed by those linked pages, writes them under `images/checkout/components/`, records provenance and failures in `download-manifest.json`, and updates matching catalog records through the normal audited admin API. The optimization command converts JPEG and PNG component photos to quality-82 WebP, verifies each result before removing its source, and updates both image manifests. The URL rewrite then updates the selected checkout database transactionally. Treat every downloaded supplier image as provisional: confirm the exact component revision and permission to publish it before production.

After importing the full inventory, seed the curated motor, servo, driver, and controller relationships plus platform-specific safety guidance:

```powershell
$env:CHECKOUT_PGLITE_PATH="./checkout-catalog-preview-data" # local preview only
npm run checkout:seed-relationships
npm run checkout:seed-package-quantities
npm run checkout:merge-components
npm run checkout:remove-untracked-components
npm run checkout:apply-local-images
```

The package-quantity seed converts clearly documented multipacks into individual checkout units. The merge command then applies the organizer-approved duplicate groups transactionally. The removal command drops loose jumper-wire rows that organizers provide without checkout tracking. Review `CHECKOUT_INVENTORY_QUANTITY_AUDIT.md` for the resulting totals and remaining ambiguous groups.

For PostgreSQL, set `DATABASE_URL` instead. The operation is idempotent: it preserves non-empty platform guidance and updates the curated relationship ratios/messages.

## Edit Content

The November 6 physical inventory and received wishlist are reconciled with
`npm run checkout:reconcile-final-inventory`. With `DATABASE_URL` set this defaults
to a read-only preview; pass `-- --apply` to apply the verified changes through
the audited inventory service. `-- --catalog` updates the local seed snapshot
and source manifest. Use `-- --stockouts-only --apply` to mark red/uncolored CURC
items out of stock without resetting newer counts for confirmed components.
This preserves MLH stock and existing reservations, loans, and damaged-stock
records while setting available stock to zero. The DMM, small solderable boards,
and PING unit remain protected. This reconciliation performs no database deletions, holds
ambiguous matches and package counts, preserves MLH inventory and existing order
history, and excludes four unreceived wishlist shipments from new additions.
Review [INVENTORY_REVIEW_2026-11-07.md](INVENTORY_REVIEW_2026-11-07.md) for the
remaining confirmation and photo requests. Do not rerun the older order-based
wishlist or inventory seed scripts against the reconciled production inventory.

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
