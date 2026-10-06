# Deployment Notes

## What You Need Access To

To update `https://makecu.dev/`, you need one of these:

- Access to the existing Vercel project or Vercel team that currently owns `makecu.dev`.
- Access to the domain registrar or DNS provider for `makecu.dev`, so you can point the domain to a new Vercel project.
- Access to the previous GitHub repository if the existing Vercel project still deploys from it.

If you do not get any of those, you can still deploy for free to a generated Vercel URL such as `makecu-2026.vercel.app`, then swap to `makecu.dev` later.

## Free Deployment Path

1. Create or choose a GitHub repo you control.
2. Push this folder to GitHub.
3. In Vercel, choose **Add New Project** and import the repo.
4. If the repo root contains this folder, set the Vercel **Root Directory** to `mlh-hackathon-boilerplate`.
5. Keep the project as framework preset **Other**.
6. The included `vercel.json` sets:
   - Install command: `npm install`, followed by the Ruby bundle install
   - Build command: `bundle exec jekyll build`
   - Output directory: `_site`
7. Deploy.

## Hardware Checkout Configuration

The checkout UI is static, but every authentication and inventory action is handled by the serverless API and PostgreSQL. Do not deploy the checkout system without a durable PostgreSQL database; production requests fail closed when `DATABASE_URL` is missing.

Add these environment variables to the Vercel project for Production and Preview as appropriate:

- `DATABASE_URL`: PostgreSQL connection string with SSL enabled.
- `CHECKOUT_ADMIN_USERNAME`: initial volunteer username.
- `CHECKOUT_ADMIN_PASSWORD`: initial volunteer password with at least 10 characters.
- `CHECKOUT_ADMIN_NAME`: volunteer display name.
- `CHECKOUT_LIVE_START`: opening time as an ISO 8601 timestamp with timezone.
- `CHECKOUT_ORDERING_END`: time when new team orders stop, as an ISO 8601 timestamp with timezone.
- `CHECKOUT_RETURN_END`: time when the admin return period stops, as an ISO 8601 timestamp with timezone.

Use `.env.checkout.example` as a key-only reference. Never commit real credentials. Do not set `CHECKOUT_FORCE_LIVE` in Vercel; the override is ignored when `NODE_ENV=production`.

Before the event, run the row-locking integration suite against a disposable PostgreSQL database (never the production database):

```powershell
$env:CHECKOUT_POSTGRES_TEST_URL="postgresql://.../disposable_test_database"
npm run test:checkout:postgres
```

The suite creates and removes its own isolated schema while exercising simultaneous team reservations, same-team submissions, and three-admin order claims over independent pooled connections.

After configuring the database, provision the four volunteer accounts from a trusted local terminal:

```powershell
$env:DATABASE_URL="postgresql://..."
npm run checkout:provision-admins
```

This creates `admin-1` through `admin-4` with independent 192-bit random passwords and deactivates the legacy generic `admin` login. Passwords are written only to the ignored and Jekyll-excluded `checkout-admin-credentials.local.json` file on that trusted computer and are never printed. Move the passwords into the club's approved password manager, distribute each account to one volunteer, then remove the local plaintext file after confirming the password-manager copy. Use `npm run checkout:provision-admins -- --rotate` only when all four passwords should change.

The database stores salted scrypt password hashes, and signed-in browsers receive random sessions in `HttpOnly`, `SameSite=Strict`, and production-only `Secure` cookies. Only a SHA-256 hash of each session token is stored. Every volunteer endpoint checks the database role server-side; a team session receives HTTP 403 even if someone manually calls an admin endpoint. Same-origin validation and the strict cookie limit cross-site requests.

For a new production database, import the finalized catalog snapshot once after provisioning the admins:

```powershell
$env:DATABASE_URL="postgresql://..."
npm run checkout:import-catalog
npm run checkout:verify-production
```

The importer is atomic and refuses to run unless the production component table is empty. The versioned snapshot contains inventory data only; it contains no users, passwords, sessions, or other secrets.

If the sample catalog is needed, seed it separately from a trusted local terminal:

```powershell
$env:DATABASE_URL="postgresql://..."
$env:CHECKOUT_ADMIN_USERNAME="admin"
$env:CHECKOUT_ADMIN_PASSWORD="use-a-long-unique-password"
$env:CHECKOUT_ADMIN_NAME="Volunteer Name"
npm run checkout:seed
```

The API creates missing tables and applies additive checkout migrations idempotently. The older single-admin seed remains available for development compatibility, but competition volunteers should use the four separately provisioned accounts. Set `CHECKOUT_SEED_SAMPLES=false` when production inventory should start empty.

Seeded sample components are inactive because active inventory requires a verified photo and image description. Add the final photo, alt text, bin location, stock counts, protected stock, and technical/power guidance in the Inventory screen before activating each item.

Before the event, verify all three production window timestamps from `/api/checkout?action=status`, create unique credentials for every team in **Teams / Returns**, replace sample inventory, and run a rehearsal using at least two team sessions and three volunteer sessions. Test order competition, same-team submission competition, claim competition and takeover, accepted/ready separation, pickup versus cancellation, partial returns, damaged/missing handling, idempotent retries, stale inventory forms, automatic expiry, and the Activity trail.

Vercel's Hobby plan is free for personal and small-scale projects, but Vercel's docs say it is restricted to non-commercial, personal use. If Columbia Robotics wants shared team access or official organization ownership, check whether the club should use a Vercel team or another free host such as GitHub Pages.

The `checkout` branch is mergeable into `gh-pages` as source, and the main website intentionally contains no navigation link to `/checkout/`; organizers share that direct URL. However, GitHub Pages by itself only serves the static Jekyll frontend and cannot run `api/checkout.js` or PostgreSQL authentication. The branch that receives this code must still be deployed through Vercel (or an equivalent same-origin Node/serverless host) for the checkout to function.

## Connecting `makecu.dev`

After the new deployment works:

1. In Vercel, open the project settings and add `makecu.dev` under Domains.
2. Vercel will show the required DNS records.
3. Whoever controls DNS for `makecu.dev` must add those records.
4. Wait for DNS and SSL to propagate.

If Vercel says the domain is already assigned to another project, ask the previous MakeCU organizers for access to that project/team or ask the domain owner to remove/reassign it.

## MLH Website Checklist

The MLH guide recommends these main website sections, which this page includes:

- Landing page with name, date, location, and registration placeholder
- About section
- Sponsors section
- FAQ
- Footer links and contact details

Before publishing widely, replace placeholders for:

- MyMLH registration or your official registration form
- Mentor, judge, volunteer, and sponsorship forms
- Confirmed sponsor logos and links
- Venue address, room map, and accessibility details
- Hardware inventory and safety/training requirements
- Schedule, tracks, prizes, judges, and mentors
- Official email, Discord, and social links
- Any Columbia University event policy links

References:

- MLH main website guide: https://guide.mlh.io/general-information/hackathon-website/main-website
- Vercel build settings: https://vercel.com/docs/builds/configure-a-build
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Vercel domains overview: https://vercel.com/docs/domains
