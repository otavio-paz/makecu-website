# MakeCU Checkout System: Implementation Guide and Readiness Audit

**Updated:** October 5, 2026
**Branch:** `checkout`
**Base commit audited:** `f113f0bec802eb5144ddeec14c8abac1141f870b`
**Design reference:** `CHECKOUT_SYSTEM_DESIGN_HACKATHON.md`

## Current conclusion

All required application features in the design document are implemented on the local `checkout` branch, subject to the explicit exclusions below. The build is feature-complete for a supervised competition rehearsal.

The remaining readiness work is operational rather than missing application behavior:

1. Run `npm run test:checkout:postgres` against a disposable production-style PostgreSQL database. The suite uses independent pooled connections but has not been executed because no PostgreSQL test URL is configured locally.
2. Verify final physical counts, team limits, protected stock, bin locations, and curated compatibility relationships against the hardware on hand.
3. Image review is intentionally deferred. The local full-catalog preview contains 58 provisional supplier-page images and uses an explicit “photo pending review” image for the remaining 130 items.

Per organizer direction, unattended scheduled expiry and expiring-soon warnings are intentionally excluded. Lazy expiry remains enforced whenever the application receives traffic.

## How the system works

### Architecture

The checkout application consists of:

- a static Jekyll page in `checkout.html`;
- browser behavior and five-second polling in `js/checkout.js`;
- a serverless HTTP handler in `api/checkout.js`;
- transactional business logic in `api/_lib/checkout-service.js`;
- authentication and session helpers under `api/_lib/`;
- a PostgreSQL schema and additive migrations in `db/checkout-schema.sql`.

Production requires durable PostgreSQL through `DATABASE_URL`. Local development and the default automated tests use PGlite. The API requires Node.js 22 or newer.

### Authentication and permissions

Four separate volunteer accounts (`admin-1` through `admin-4`) are provisioned with cryptographically random passwords by `npm run checkout:provision-admins`, which also deactivates the legacy generic `admin` login. Plaintext credentials exist only in a Git-ignored and Jekyll-excluded local handoff file; only salted scrypt hashes are stored in the database. Re-running provisioning is idempotent unless the explicit `--rotate` flag is used.

The browser receives a random session token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production), while the database stores only its SHA-256 hash. Roles are enforced on every API route. A team session cannot reach the admin overview, inventory, team-management, activity, reporting, or fulfillment actions even if it constructs a request manually.

Teams can browse active inventory, submit orders, view their receipts, and see current holdings. Admins can manage teams and inventory, claim and process orders, handle returns, and inspect activity.

### Event phases

The server is authoritative for event timing:

- `CHECKOUT_LIVE_START`: login and event access begin;
- `CHECKOUT_ORDERING_END`: new team orders stop;
- `CHECKOUT_RETURN_END`: the admin return period ends.

During the return-only period, new orders are rejected while returns remain available. Outside the overall window, the API fails closed. `CHECKOUT_FORCE_LIVE=true` works only outside production and is intended for local development.

### Inventory model

For each component:

```text
available = total - reserved - checked_out - unavailable
team_orderable = available - protected_stock
```

Database constraints protect the core inventory totals. The API also enforces active state, whole positive order quantities, usable inventory, and per-team limits.

Component records include:

- name and description;
- image URL and accessible image description;
- category and broad Arduino/Raspberry Pi compatibility;
- free-form technical and power guidance;
- physical bin/location;
- total, reserved, checked-out, unavailable, and protected stock;
- maximum active quantity per team;
- active/inactive state;
- admin notes;
- an optimistic-lock version.

Active components require both a photo and image description. Existing or seeded records without them are automatically kept inactive. The user will review the actual image choices separately.

### Local full-catalog preview

The local preview at `http://127.0.0.1:4173/checkout/` is populated from the `Full Inventory Check 10-4-26` sheet in `MakeCU Hardware List 2026.xlsx`:

The admin inventory view supports name search plus category and compatibility tag filters. Desk Activity supports free-text search across messages, teams, volunteers, order numbers, and displayed dates. Page-level duplicate kickers were removed, the header uses the MakeCU robot logo, and the login screen reuses the main site's blue/orange animated circuit visual language.

- 201 spreadsheet rows with a name and positive quantity;
- 176 checkout items after approved consolidations, removing loose jumper-wire tracking, and adding Pin Headers;
- 2,417 total tracked checkoutable units;
- 13 categories.

This catalog lives only in the ignored `checkout-catalog-preview-data/` PGlite database. It is not a production seed and is not committed to Git.

For this preview, every item is active so the complete participant catalog can be reviewed. Public descriptions explain the component's function, likely project uses, primary interface, and any important connection or safety constraint. They were curated from the workbook's product links where available: 113 source rows contain hyperlinks, including 49 DigiKey listings, 48 Amazon listings, and 16 manufacturer, distributor, or datasheet links. Commodity parts without a link use conservative functional guidance and avoid unverified model-specific specifications. The repeatable description command is `npm run checkout:enrich-descriptions` with `CHECKOUT_BASE_URL`, `CHECKOUT_ADMIN_USERNAME`, and `CHECKOUT_ADMIN_PASSWORD` set. Original spreadsheet notes, usage notes, source/vendor, unit cost, source row numbers, and inventory-confirmation state remain in the admin-only notes field because several spreadsheet notes are informal and have not been approved for participants.

The image importer uses the 108 consolidated linked component names recorded in `scripts/checkout-component-sources.json`. Running `npm run checkout:download-images` downloads a page's best available Open Graph, Twitter Card, or product-image candidate, rejects non-raster and very small responses, records provenance and failures in `images/checkout/components/download-manifest.json`, and updates matching catalog records through the audited admin API. The first pass, before the approved component merges, produced:

- 58 valid provisional downloads; after consolidation and 29 organizer-provided local-image mappings, 85 catalog items currently have a non-placeholder photo;
- 52 failed linked components: 50 DigiKey pages returned HTTP 403 to automated access, one discontinued Amazon URL returned HTTP 404, and one Best Buy page timed out;
- one skipped LCD entry whose workbook link is a PDF datasheet rather than a product-photo page;
- 77 components with no workbook hyperlink, which were not guessed or searched independently.

All 87 retained component-photo assets are WebP and pass raster decoding. Converting the 74 JPEG/PNG sources reduced the component-photo directory from 9,454,886 bytes to 7,442,114 bytes (21.3%) without resizing. The 85 catalog items with a photo reference those optimized assets; the remaining 91 cards retain `images/checkout-image-pending.svg` with item-specific accessible text. Supplier images are provisional references for organizer review; confirm the depicted revision and permission to publish each image, or replace it with a MakeCU-owned photo before production.

Import assumptions used for the preview:

- duplicate names are consolidated and their quantities are summed;
- `Both!`, `Arduino only`, `RPI only`, and `NA` map to the application's compatibility values;
- missing or `???` compatibility maps to `N/A` pending review;
- maximum per team is 1 for quantities up to 4, 2 for 5–9, 3 for 10–19, and 5 for 20 or more;
- items with at least 10 units reserve approximately 10% as protected stock, with a minimum of one unit;
- the spreadsheet's `Confirmed?` column is preserved as audit metadata, not used to hide cards in this staging preview.

Only 21 of the 201 imported source rows are marked confirmed in the workbook. Organizers must verify physical counts, duplicate consolidation, compatibility, limits, protected stock, ambiguous/unlabeled component identities, bin locations, and photos before using this catalog at the event. The catalog descriptions are participant-facing guidance, not a substitute for checking the exact part marking or datasheet before applying power.

Local demonstration credentials are:

- participant: `demo-team` / `makecu-team-2026`;
- volunteer: `admin` / `makecu-local-2026`.

Inventory edits include the component version that the admin originally opened. If another admin saves first, the stale save receives HTTP 409 instead of overwriting the newer data. Editing an existing component also requires an inventory change reason, which is stored with the before/after audit record.

### Team ordering and concurrency

Order submission runs in one transaction:

1. Lock the team row.
2. Recheck the ten-minute cooldown.
3. Lock requested component rows in ascending component ID order.
4. Recalculate the team's checked-out plus reserved quantities.
5. Check active state, per-team limits, protected stock, and current availability.
6. Create the order and immutable item snapshots.
7. Increase reserved inventory.
8. Create inventory, order-event, and activity records.
9. Commit.

The team lock prevents two tabs or simultaneous teammates from passing the cooldown and limit checks together. Component locks prevent two teams from receiving the same final unit.

New submitted reservations expire after 30 minutes unless they advance. Expiry releases reserved stock and records an immutable event and inventory transaction.

### Idempotent mutations

The browser creates a unique idempotency key for each logical mutation and retains it across an ambiguous network/server failure. The API stores the completed JSON result under the authenticated user, action, and key.

Concurrent or later retries with the same key return the original response without repeating the mutation. This wrapper covers:

- order submission;
- claim and claim release;
- quantity adjustment and acceptance;
- ready, pickup, and cancellation;
- component creation/editing;
- team creation and password reset;
- return processing.

The idempotency record and the underlying business operation commit in the same database transaction.

### Order workflow

The implemented workflow is:

```text
SUBMITTED -> REVIEWING -> ACCEPTED -> READY -> PICKED_UP
     |            |           |         |
     +------------+-----------+---------+-> CANCELLED
     +------------+-----------+------------> EXPIRED
```

#### Submitted

Inventory is already reserved. The order receives a formatted receipt code such as `O-00042` and a 30-minute reservation deadline.

#### Reviewing

An admin claims the order under a seven-minute lease. A database row lock ensures only one of simultaneous claim attempts wins. The owner can reduce quantities, accept the order, cancel it, or release the claim. Activity renews the lease. If the lease expires, another admin can take it over.

#### Accepted

Approved quantities are final. This state is intentionally separate from physical preparation. Acceptance extends the reservation hold by 45 minutes.

#### Ready

The accepting volunteer confirms that the approved hardware has been physically gathered. The ready hold lasts 30 minutes. The picking view displays item images and bin locations.

#### Picked up

Any admin may confirm handoff. The transaction locks the order, items, and components; moves approved quantities from reserved to checked out; updates team holdings; records the pickup actor and event; and clears the reservation deadline. A competing cancellation cannot also succeed.

#### Cancelled or expired

Reserved quantities are returned to availability. Cancellation records the admin and optional note. Expiry records an automatic order event and inventory transaction. Neither state deletes the receipt.

### Receipts and history

Orders use `O-#####` codes and returns use `R-#####` codes. Order items snapshot the component name, image, image description, and category when the order is created, so later catalog edits do not rewrite the historical receipt.

The order event stream records submission, claim, takeover/release, adjustment, acceptance, ready, pickup, cancellation, and expiry with timestamps and actors where applicable. Pickup, accepted, ready, and cancelled actors also have dedicated order fields.

The receipt dialog displays the saved line items and event timeline. Inventory transactions retain before/after state for component edits. The admin Activity screen shows the most recent 250 human-readable events.

### Returns

Admins process returns from the team's current holdings. Team holding and component rows are locked in one transaction. Over-returning is rejected.

- `GOOD` decreases checked-out stock and makes it available.
- `DAMAGED` decreases checked-out stock and increases unavailable stock.
- `MISSING` decreases checked-out stock and increases unavailable stock.

Damaged and missing entries require a note. Partial returns are supported. Return item names are snapshotted, and idempotent retry returns the original receipt instead of processing the hardware twice.

If a volunteer records the wrong return, the original `R-#####` receipt remains unchanged. A reason-required `C-#####` correction receipt records the affected quantity, original outcome, corrected outcome, volunteer, note, and time. The correction transaction updates team holdings and inventory, rejects over-correction, and refuses unsafe changes after intervening allocations.

### Compatibility guidance and relationships

Components have separate Arduino and Raspberry Pi guidance plus structured `requires`, `recommends`, `compatible_driver`, and `compatible_power_supply` relationships. Each relationship stores a target component, capacity ratio, activation threshold, and participant-facing message.

The cart calculation counts checked-out hardware, active reservations, and the current cart. Missing required hardware blocks submission server-side; warnings and recommendations remain advisory. Teams can add the calculated missing quantity directly. Admins edit relationships in the inventory form.

The local 176-item catalog has curated guidance on 25 motor, servo, controller, and Pi-related components and 15 driver/recommendation relationships. `npm run checkout:seed-relationships` reapplies this data idempotently after a catalog import. `npm run checkout:merge-components` transactionally reapplies the approved duplicate groups, including tactile buttons and ultrasonic sensors. The removal and local-image commands then drop untracked loose jumper-wire rows, add Pin Headers, and attach organizer-provided photos.

### Protected-stock exceptions

Normal team orders cannot consume protected stock. From the selected team's admin screen, a volunteer can create a reason-required exception order. Physical-stock and per-team checks still apply. The order is reserved and claimed immediately, while the reason is recorded on the order, event stream, inventory ledger, and activity log.

### End-of-event reconciliation

The admin report compares component reserved counters with active order items and checked-out counters with per-team holdings. It flags mismatches, lists outstanding team hardware, and summarizes reserved, checked-out, unavailable, damaged, missing, and correction-receipt totals.

### Live updates

Team catalog, order, holding, and cooldown data refresh every five seconds. Admin overview data also refreshes every five seconds, along with whichever admin tab is active: order queue, teams/returns, inventory, activity, or reconciliation report. The order board shows claim ownership and lease expiry.

## Acceptance-criteria status

| # | Acceptance criterion | Status |
|---:|---|---|
| 1 | At least three admins can use it simultaneously | **Met in code and PGlite test; PostgreSQL rehearsal pending** |
| 2 | Multiple teams cannot drive inventory negative | **Met; PostgreSQL rehearsal pending** |
| 3 | One team cannot bypass limits with multiple tabs | **Met** |
| 4 | Duplicate mutations do not repeat inventory changes | **Met** |
| 5 | Only one admin can own an active claim | **Met** |
| 6 | Abandoned claims recover | **Met** |
| 7 | Stale inventory edits are rejected | **Met** |
| 8 | Every order has a reliable receipt/history | **Met for new orders; pre-migration events cannot be reconstructed** |
| 9 | Every pickup records what was handed out | **Met** |
| 10 | Every return records what came back | **Met** |
| 11 | Damaged and missing hardware remain traceable | **Met** |
| 12 | Team limits include reserved plus checked-out stock | **Met** |
| 13 | Protected stock is enforced | **Met, including a reason-required per-order exception flow** |
| 14 | Motors/servos recommend driver and power hardware | **Met through structured relationships and cart calculations** |
| 15 | Arduino/Raspberry Pi safety warnings are visible | **Met through platform-specific guidance and relationship messages** |
| 16 | Every active component has an image | **Enforced; actual images await organizer review** |
| 17 | Volunteers can see physical bin/location | **Met** |
| 18 | Abandoned orders release inventory | **Met on subsequent application activity; unattended scheduling intentionally excluded** |
| 19 | Server rechecks inventory rules | **Met** |
| 20 | Concurrency tests pass on production-style PostgreSQL | **Suite implemented; execution pending a disposable PostgreSQL URL** |

## Verification performed

`npm test` currently passes 21 tests with zero failures. The suite covers:

- live-window enforcement;
- salted password hashing;
- competition for the last item;
- same-team simultaneous submissions;
- idempotent order replay;
- team isolation;
- three-admin claim competition and expired-claim takeover;
- Accepted/Ready/Pickup flow;
- pickup-versus-cancel concurrency;
- stale component versions;
- automatic reservation expiry and stock release;
- damaged returns and audit data;
- safe image URLs and the active-image requirement;
- required damaged/missing notes;
- structured driver relationships and required-item blocking;
- protected-stock exception orders;
- append-only return corrections;
- end-of-event reconciliation and mismatch detection;
- idempotent package-to-piece inventory quantity corrections;
- transactional, idempotent component consolidation without losing team holdings;
- safe removal of unused loose-jumper inventory while preserving audit transactions;
- idempotent organizer-photo attachment and Pin Headers creation.

`npm run test:checkout:postgres` creates an isolated temporary schema and uses independent pooled PostgreSQL connections to test final-item races, same-team serialization, and three-admin claims. Without `CHECKOUT_POSTGRES_TEST_URL`, it skips safely rather than guessing at a database.

`bundle exec jekyll build` succeeds. The build emits non-fatal Ruby warnings that `csv`, `base64`, and `bigdecimal` may need explicit Gemfile entries on a future Ruby release.

The local branch and locally known `origin/checkout` ref pointed to `f113f0b` before these working-tree changes. GitHub was unreachable during the original audit, so remote freshness could not be independently rechecked.

## Deployment and operating assumptions

- Production provides durable PostgreSQL with permission to create and alter the checkout tables.
- Checkout UI and API are served from the same origin over HTTPS.
- Each volunteer uses a separate admin credential.
- The source may merge into `gh-pages`, but production must still use Vercel or another same-origin backend host; GitHub Pages alone cannot execute the checkout API.
- The public homepage intentionally has no navigation button to `/checkout/`; event staff distribute the direct link.
- Organizers set all three event timestamps with explicit timezone offsets.
- Final counts, limits, protected stock, bin locations, technical guidance, and images are verified against the physical inventory.
- An active browser/API request occurs often enough for lazy reservation expiry. Unattended scheduled expiry and expiring-soon warnings were explicitly excluded.
- Users may need to sign in again during an event longer than the 18-hour session lifetime.
- Barcode scanning, payments, shipping, and general warehouse management remain out of scope.

## Remaining readiness checklist

1. Set `CHECKOUT_POSTGRES_TEST_URL` to a disposable PostgreSQL database and run `npm run test:checkout:postgres`.
2. Rehearse submit → claim → accept → ready → pickup → partial return → correction with at least three volunteer accounts.
3. Verify relationships, ratios, platform guidance, limits, protected quantities, bin locations, and counts against the physical inventory.
4. Review or replace provisional component images when the organizer is ready.

Recommended label: **feature-complete staging build, pending PostgreSQL and physical-inventory rehearsal.**
