# 10 — M1 Foundation Report

**Status:** M1 complete — awaiting approval to start M2.
**Date:** 2026-11-06
**Approval basis:** M0 decisions D1–D16 were approved by the owner. No deployment, paid resource, or production database change was made.

## 1. What was delivered

| Area | Delivered |
|---|---|
| Typed environment | `src/env.ts` and `src/types.ts`; every Hono instance now has typed bindings and context variables. The original `c.env` typecheck failure is fixed. |
| Google authentication | RS256 signature verification against Google JWKS, issuer check, **multiple audiences**, `azp` check, `exp` check, stable `GoogleTokenError` codes. |
| Login replay protection | `POST /v1/auth/nonce` issues a 10-minute single-use challenge; `POST /v1/auth/google` verifies the nonce claim and consumes the hashed nonce atomically. |
| Sessions | Opaque 32-byte bearer tokens; only SHA-256 hashes are stored. 7-day idle and 30-day absolute expiry, 5-minute touch interval, rotation on refresh, revocation on logout. |
| RBAC and ownership | Pure policy functions for role, booking participation, customer resource ownership and partner profile ownership, plus `createRequireAuth` and `requireRole` middleware. Roles always come from the session's database user. |
| HTTP hardening | Request IDs on every response, structured redacted logs, CORS allowlist that emits no origin for disallowed requests, 64 KiB JSON body limit, native Workers rate-limit binding on auth routes, stable error envelopes, JSON 404s. |
| Schema | Reconciled Drizzle schema covering the documented entities plus `sessions`, `auth_nonces`, `customer_profiles`, `booking_quote_items`, `dispatch_attempts`, `notification_deliveries` and `app_config`. |
| Migrations | Generated `database/migrations/0000_initial_schema.sql`; matching down migration at `database/rollback/0000_initial_schema.down.sql`. The old hand-written `database/0001_initial_schema.sql` was removed because it is superseded. |
| Tests | 41 Vitest tests across five original files plus the RBAC middleware file: Google JWT failures, session lifecycle, nonce replay, policy boundaries, HTTP boundary, redaction and role middleware. |
| Tooling | ESLint flat config, Vitest 5 config, Drizzle Kit config, `npm run db:check`, `db:rollback`, and a GitHub Actions CI workflow running lint, typecheck, tests, migration check and runtime dependency audit. |

### Schema changes driven by the M0 decisions

- PostGIS `geography(Point,4326)` replaced with `numeric(9,6)` latitude/longitude (D5).
- Address snapshot columns added to `bookings`; `address_id` is now an optional origin reference (S3).
- Added `sessions`, `auth_nonces`, `customer_profiles`, `booking_quote_items`, `dispatch_attempts`, `notification_deliveries` and `app_config` (S1/S2 gaps and documented entity mismatches).
- Added verified-email partial unique index and lowercase-email check (D12).
- Added dispatch candidate indexes: partner category/verification, zone membership, online availability, partner status/city.
- Added booking/partner/address foreign-key indexes, money checks, INR checks, sequence checks and idempotency TTL.
- Partner assignments now reference `partner_profiles(user_id)`, not arbitrary users (S5).
- Audit rows now carry request ID, IP hash and user agent (S12).
- Media rows now carry booking/partner association and verification metadata (S11).

## 2. Verification actually run

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** (exit 0) |
| `npm run lint` | **Pass** (exit 0) |
| `npm test` | **Pass** — 41 tests / 6 files, 0 failed |
| `npm run db:check` | **Pass** — Drizzle reports migration consistency |
| `npm audit --omit=dev` | **Pass** — 0 runtime vulnerabilities |
| `npx wrangler deploy --dry-run` | **Pass** — bundle 1355.20 KiB (252.43 KiB gzip); `BOOKING_ROOM`, `AUTH_RATE_LIMITER` and vars recognized |
| `npm audit` (all) | **11 moderate, dev-only**; no high or critical. Mostly the deprecated `@esbuild-kit/*`/`esbuild` chain behind `drizzle-kit`, plus `typescript-eslint`/`minimatch`. CI gates runtime dependencies only. |

### What the tests prove

- Google ID tokens: valid multi-audience token accepted; wrong audience, wrong issuer, expired token, bad signature, missing subject, invalid `azp` and empty audience configuration rejected using a locally generated RS256 key set.
- Sessions: raw token is never stored; unknown tokens fail; idle and absolute expiry enforced; logout revokes; rotation invalidates the old token; reused and mismatched nonces fail; disabled accounts fail closed.
- Authorization: customer/partner/admin booking access, customer resource ownership, partner profile ownership, disabled-account denial, and client-supplied role headers ignored.
- HTTP: nonce → login → `/v1/me` flow, missing/invalid bearer, invalid Google token, malformed JSON, request ID, allowed/disallowed CORS, oversized body, rate-limit 429, readiness 200/503 and JSON 404.
- Logging: tokens, emails, addresses, nonces and authorization headers are redacted at nested depth.

## 3. Files changed

**Added**

- `src/env.ts`, `src/types.ts`
- `src/lib/clock.ts`, `crypto.ts`, `errors.ts`, `logger.ts`, `validation.ts`
- `src/db/schema.ts`, `client.ts`, `health.ts`
- `src/auth/repository-contract.ts`, `repository.ts`, `service.ts`, `policy.ts`
- `src/middleware/request-context.ts`, `cors.ts`, `auth.ts`, `rate-limit.ts`, `error-handler.ts`
- `src/routes/auth.ts`, `me.ts`
- `test/google-token.test.ts` (replaced placeholder), `session-service.test.ts`, `policy.test.ts`, `app.test.ts`, `logger.test.ts`, `rbac-middleware.test.ts`
- `test/helpers/test-clock.ts`, `in-memory-auth-repository.ts`, `test-env.ts`
- `drizzle.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`
- `database/migrations/0000_initial_schema.sql`, `database/migrations/meta/*`
- `database/rollback/0000_initial_schema.down.sql`
- `docs/10-m1-foundation.md`

**Updated**

- `src/index.ts`, `src/app.ts`, `src/routes/health.ts`, `src/auth/google-token.ts`
- `package.json`, `package-lock.json`, `tsconfig.json`, `wrangler.jsonc`, `.env.example`, `README.md`, `docs/09-m0-architecture-review.md`

**Removed**

- `database/0001_initial_schema.sql` (superseded by the generated migration)

## 4. Deviations and deferred items

| Item | Status |
|---|---|
| D7 admin bootstrap and 8-hour admin sessions | Schema and `ADMIN` enum exist; bootstrap CLI/SQL and admin TTL are deferred to M6. There is no public admin path. |
| D11 idempotency enforcement | Table, TTL and unique constraint exist; request middleware waits for the first mutating booking route in M3. |
| D12 email account linking | Verified-email partial unique index exists; linking policy beyond Google `sub` waits for a product decision in M2. |
| D8 DB-backed login counters | Native per-location rate limiting is wired; strict DB counters should be added when the login surface expands. |
| D4 Queues, D9 Cloudinary, D10 location retention, D13 admin config, D14 plan, D15 state machine | Not in M1; scheduled for M2–M6. |
| Durable Object room | Still a 501 placeholder; scheduled for M5. |
| OpenAPI, runbooks, threat model, load test, backup drill | Not yet produced; M6/release readiness. |

## 5. Limitations and risks

- **The migration was not executed against PostgreSQL.** There is no `DATABASE_URL`, and `psql`/Docker are unavailable on this machine. `drizzle-kit check` validates the migration journal, not SQL execution. The up/down pair must be applied to a scratch Neon branch before any shared environment.
- **No live `wrangler dev` boot test and no deployment.** The dry-run bundle proves export/config validity, not runtime behavior against Neon.
- **No real Neon repository integration test.** Auth repository SQL is exercised only through the in-memory contract; production SQL paths are unverified.
- **Google tests use locally generated RSA keys**, not a real Google-issued token or live JWKS fetch.
- **Session hashes are unsalted SHA-256.** This is acceptable for 256-bit random tokens; adding a pepper is possible if operations require it, at the cost of key rotation.
- **Native rate limiting is approximate and per Cloudflare location.** It is not a login lockout.
- **Dev-only audit moderates remain** in `drizzle-kit`'s deprecated esbuild dependency chain and `typescript-eslint`.
- **No production claims.** No penetration test, load test, backup/restore drill, legal review, or external security audit has been performed.

## 6. Next approval

M2 would add catalogue (cities, zones, categories, items), partner onboarding and approval, admin authorization routes with audit writes, and Cloudinary signed-upload verification.

The two M1 follow-ups worth deciding before M2 are: apply the migration to a scratch Neon branch, and decide the admin bootstrap mechanism (operator SQL vs CLI). No M2 code will start without approval.
