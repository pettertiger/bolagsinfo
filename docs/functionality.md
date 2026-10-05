# Data and functionality outline

## Data ownership

- Cloudflare D1 is the shared SQLite source of truth. The browser never connects to D1 directly; a Cloudflare Worker authenticates users, checks permissions, validates input, and accesses the D1 binding.
- `database/schema.sql` defines the initial D1 schema. `database/seed.sql` adds the four approved users and 83 supplied contracts. Seeded accounts start as `viewer` until an administrator is explicitly assigned.
- `database/schema.sql` defines the initial D1 schema. `database/seed.sql` adds the four approved users and 83 supplied contracts. Petter is seeded as `admin`; the other three start as `viewer`.
- Store dates as ISO `YYYY-MM-DD` text and timestamps as UTC ISO text. Keep SCB credentials in Cloudflare secrets, not in D1 or browser code.
- Map SCB responses to the internal categories before storage. Retain original source payloads only if SCB's terms permit it.

## Access and roles

- Identify a user by their approved email and issue a separate random access code for each person. Do not accept a user identity supplied only by the browser.
- Store only a salted, slow password-derived hash of each code in `app_user`; never store or log a code in plaintext. Provide a one-time, out-of-band way to distribute and replace codes.
- Generate each hash locally with `node scripts/generate-access-code.mjs user@example.com`, then run the printed `UPDATE` statement in the target D1 Console. The generator uses 100,000 PBKDF2 iterations, the maximum supported by Cloudflare Workers Web Crypto. Repeat for all four users; never commit the printed statement or the codes.
- Codes are a temporary authentication method, not equivalent to Microsoft sign-in. Use HTTPS, short-lived opaque sessions with `HttpOnly`, `Secure`, and `SameSite` cookies, CSRF protection for mutations, per-account and per-IP rate limits, and temporary lockout after repeated failures.
- Run `database/migrations/0002_auth_login_attempt.sql` in the existing D1 database before deploying this Worker version. Five failed attempts for the same email/IP combination cause a 15-minute lockout.
- `viewer` may read contracts and published statistics. Only `admin` may create, edit, or remove contracts, manage access, and run or publish imports. Enforce this in the Worker on every request, not just by hiding UI controls.
- Log the authenticated user on every mutation. Use the contract `version` for optimistic concurrency and return HTTP 409 if another administrator changed the same row first.

## Contract behavior

- List active contracts ordered by `due_date ASC`, then company name. Past-due rows remain visible.
- Create and edit require a non-empty company name and valid date. Notes are optional.
- Removal is explicit and manual; no scheduled job purges expired contracts. Soft-deleted rows remain available for audit and recovery.

## SCB imports and monthly lists

1. Fetch SCB data in a Worker and write it to an import batch with status `staging`. The admin baseline action fetches employee-size classes 1-7 from the legal-entity API (SCB does not accept class code 0 as a filter), one 100-row cursor page per Worker request. Each page is saved atomically with its cursor so an interrupted import can be resumed.
2. Normalize each company to its stable organization number and map its employee category. Store an exact count only when SCB supplies it.
3. Validate completeness and counts. Mark a successful batch `ready`; a failed batch must not replace the last usable batch.
4. Compare the ready batch with the preceding reference month. Include a company only when its current category is `50_99` and its previous category is `under_50`. Exclude `100_199` to `50_99`; missing or unknown prior data is not verified growth.
5. Save the generated list as a new `monthly_summary` revision. Published entries retain the company name and employee count as they were at publication. Later SCB revisions must not rewrite old summaries.

If SCB does not provide an exact employee count, show `50-99`, not an invented number. A latest available count is a separate value with its own reference month.

Before using the admin baseline action, apply `database/migrations/0003_scb_import_progress.sql` to the production D1 database with `npx wrangler d1 execute 5b341c46-18f2-4bc0-a6c4-10922cf584db --remote --file=database/migrations/0003_scb_import_progress.sql`. Then deploy the Worker. The first successful import creates the current month's baseline; it does not publish a growth list because SCB's API has no historical data. A comparison becomes possible after the next monthly snapshot.

## Suggested Worker API

- `POST /api/login` with `{ "email": "...", "code": "..." }` - creates a seven-day session cookie.
- `POST /api/logout` - revokes the current session.
- `GET /api/me` - returns the authenticated user and role.
- `GET /api/contracts?status=all|upcoming|expired&q=` - active contracts, sorted by date.
- `POST /api/contracts` - admin-only add.
- `PATCH /api/contracts/{id}` - admin-only edit, including expected `version`.
- `DELETE /api/contracts/{id}` - admin-only manual removal (soft delete).
- `GET /api/statistics/months` - published month archive.
- `GET /api/statistics/months/{YYYY-MM}` - one immutable monthly list.
- `GET /api/statistics/current` - latest published list and latest known exact counts.
- `POST /api/admin/scb/import` - admin-only server-side import/retry; never expose SCB credentials to the browser.

Initial development setup: run the login-attempt migration, generate and apply one hash per approved user, deploy the Worker, then test `POST /api/login` with a browser/client that preserves cookies. A direct browser visit to `/api/contracts` without a session should return HTTP 401.

## Decisions before deployment

- How access codes are generated, distributed, reset, and rate-limited.
- Cloudflare Worker routes, D1 binding name, and production/preview database IDs.
- SCB API fields, rate limits, historical coverage, retention, and redistribution terms.
- D1 backup/export schedule and who is responsible for restore tests.
- Whether and when to replace temporary codes with Microsoft Entra ID sign-in.