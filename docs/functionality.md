# Data and functionality outline

## Data ownership

- Cloudflare D1 is the shared SQLite source of truth. The browser never connects to D1 directly; a Cloudflare Worker authenticates users, checks permissions, validates input, and accesses the D1 binding.
- `database/schema.sql` defines the initial D1 schema. `database/seed.sql` adds the four approved users and 83 supplied contracts. Seeded accounts start as `viewer` until an administrator is explicitly assigned.
- `database/schema.sql` defines the initial D1 schema. `database/seed.sql` adds the four approved users and 83 supplied contracts. Petter is seeded as `admin`; the other three start as `viewer`.
- Store dates as ISO `YYYY-MM-DD` text and timestamps as UTC ISO text. Keep SCB credentials in Cloudflare secrets, not in D1 or browser code.
- Map SCB responses to the internal categories before storage. Retain original source payloads only if SCB's terms permit it.
- The customer map uses the 290 municipality codes and names in `municipalities.js`. They match the `id` and `kom_namn` properties in the simplified [Sweden GeoJSON](https://github.com/okfse/sweden-geojson) municipality data; keep that attribution when displaying the map.
- The map adapts polygon ring orientation to D3's spherical convention before fitting the projection. Without this, GeoJSON municipalities can be interpreted as covering nearly the entire globe.
- Municipality customer assignments are stored by four-digit municipality code and product ID, not by display name. The product catalog is in D1 so additional products can be added without changing the map's coloring logic.

## Access and roles

- Identify a user by their approved email and issue a separate random access code for each person. Do not accept a user identity supplied only by the browser.
- Store only a salted, slow password-derived hash of each code in `app_user`; never store or log a code in plaintext. Provide a one-time, out-of-band way to distribute and replace codes.
- Generate each hash locally with `node scripts/generate-access-code.mjs user@example.com`, then run the printed `UPDATE` statement in the target D1 Console. The generator uses 100,000 PBKDF2 iterations, the maximum supported by Cloudflare Workers Web Crypto. Repeat for all four users; never commit the printed statement or the codes.
- Signed-in users can change their own access code from the account header after confirming the current code. New codes must be 10–256 characters. A successful change replaces all active sessions for that account with the current session and records the change in `access_code_change`.
- Codes are a temporary authentication method, not equivalent to Microsoft sign-in. Use HTTPS, short-lived opaque sessions with `HttpOnly`, `Secure`, and `SameSite` cookies, CSRF protection for mutations, per-account and per-IP rate limits, and temporary lockout after repeated failures.
- Run `database/migrations/0002_auth_login_attempt.sql` in the existing D1 database before deploying this Worker version. Five failed attempts for the same email/IP combination cause a 15-minute lockout.
- `viewer` may read contracts and published statistics. Only `admin` may create, edit, or remove contracts, manage access, and run or publish imports. Enforce this in the Worker on every request, not just by hiding UI controls.
- Signed-in users can view the municipality customer list and map. Only `admin` can update a municipality's selected products. Each change records the administrator, municipality code, and resulting product IDs in `municipality_customer_change`.
- Log the authenticated user on every mutation. Use the contract `version` for optimistic concurrency and return HTTP 409 if another administrator changed the same row first.

## Contract behavior

- List active contracts ordered by `due_date ASC`, then company name. Past-due rows remain visible.
- Create and edit require a non-empty company name and valid date. Notes are optional.
- Removal is explicit and manual; no scheduled job purges expired contracts. Soft-deleted rows remain available for audit and recovery.

## SCB imports and monthly lists

1. Fetch SCB data in a Worker and write it to an import batch with status `staging`. The admin baseline action fetches only employee-size classes 5-7 from the legal-entity API: 20-49, 50-99, and 100-199 employees. Each 100-row cursor page is saved atomically with its cursor so an interrupted import can be resumed.
2. Normalize each company to its stable organization number and map its employee category. Store an exact count only when SCB supplies it.
3. Validate completeness and counts. Mark a successful batch `ready`; a failed batch must not replace the last usable batch.
4. An administrator can publish a comparison only when ready batches from consecutive reference months use the same baseline selection. Include a company only when its current category is `50_99` and its previous category is `20_49` or `100_199`, so the source category is visible. Do not compare with older broad baselines where `under_50` combines classes 1-5; missing or unknown prior data is not verified movement.
5. Save the generated list as a new `monthly_summary` revision. Published entries retain the company name and employee count as they were at publication. Later SCB revisions must not rewrite old summaries.

The currently displayed published monthly list can be downloaded as an `.xlsx` workbook from the summary section. The export includes the company name and the previous and current employee categories.

If SCB does not provide an exact employee count, show `50-99`, not an invented number. A latest available count is a separate value with its own reference month.

Before using the admin baseline action, apply `database/migrations/0003_scb_import_progress.sql` and then `database/migrations/0004_scb_adjacent_employee_classes.sql` to the production D1 database with `npx wrangler d1 execute 5b341c46-18f2-4bc0-a6c4-10922cf584db --remote --file=database/migrations/0003_scb_import_progress.sql` and `npx wrangler d1 execute 5b341c46-18f2-4bc0-a6c4-10922cf584db --remote --file=database/migrations/0004_scb_adjacent_employee_classes.sql`. Then deploy the Worker. The narrowed baseline is a new reference point; it does not publish a growth list because SCB's API has no historical data. A comparison becomes possible after the next monthly snapshot with the same class selection. Publication creates an immutable revision and an audit event; repeat requests for the same pair of baselines return the already-published revision.

## Suggested Worker API

- `POST /api/login` with `{ "email": "...", "code": "..." }` - creates a seven-day session cookie.
- `POST /api/logout` - revokes the current session.
- `GET /api/me` - returns the authenticated user and role.
- `POST /api/me/access-code` with `{ "currentCode": "...", "newCode": "..." }` - changes the signed-in user's code, revokes their other sessions, and issues a replacement session cookie.
- `GET /api/contracts?status=all|upcoming|expired&q=` - active contracts, sorted by date.
- `POST /api/contracts` - admin-only add.
- `PATCH /api/contracts/{id}` - admin-only edit, including expected `version`.
- `DELETE /api/contracts/{id}` - admin-only manual removal (soft delete).
- `GET /api/statistics/months` - published month archive.
- `GET /api/statistics/months/{YYYY-MM}` - one immutable monthly list.
- `GET /api/statistics/current` - latest published list, latest compatible baseline, and comparison readiness.
- `POST /api/admin/statistics/publish` - admin-only comparison and publication of the latest consecutive compatible baselines.
- `POST /api/admin/scb/import` - admin-only server-side import/retry; never expose SCB credentials to the browser.
- `GET /api/municipality-customers` - returns all 290 municipalities, the active product catalog, and each municipality's product assignments.
- `PUT /api/admin/municipalities/{code}/products` with `{ "products": ["visselblasarkanal", "redact"] }` - admin-only replacement of one municipality's product selections.

Apply `database/migrations/0005_access_code_change.sql` to the production D1 database before deploying a Worker version with self-service access-code changes.
Apply `database/migrations/0006_municipality_customers.sql` to the production D1 database before deploying the municipality customer map. It creates the product catalog, assignments, and change history, and transfers the existing map's 57 hard-coded customer entries to municipality codes.

The initial product catalog contains Visselblåsarkanal and Redact. To add another product, insert a row in `municipality_product` with a unique ID, display name, hex color, and sort order; active catalog items appear automatically in the admin form, map legend, statistics, and tooltips.

## Production deployment and domain

- The production Worker is configured with `bolagsinfo.lantero.online` as a Cloudflare Custom Domain. Cloudflare manages the DNS record and TLS certificate for this hostname; deployment requires the `lantero.online` zone to be active in the same Cloudflare account.
- The hostname previously served a parked Loopia page. Replacing it with the Bolagsinfo application is intentional.
- Deploy with `npx wrangler deploy`, then verify the homepage and HTTPS at `https://bolagsinfo.lantero.online`.

Initial development setup: run the login-attempt migration, generate and apply one hash per approved user, deploy the Worker, then test `POST /api/login` with a browser/client that preserves cookies. A direct browser visit to `/api/contracts` without a session should return HTTP 401.

## Decisions before deployment

- How access codes are generated, distributed, reset, and rate-limited.
- Cloudflare Worker routes, D1 binding name, and production/preview database IDs.
- SCB API fields, rate limits, historical coverage, retention, and redistribution terms.
- D1 backup/export schedule and who is responsible for restore tests.
- Whether and when to replace temporary codes with Microsoft Entra ID sign-in.