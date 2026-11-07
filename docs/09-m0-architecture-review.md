# 09 — M0 Architecture Review & Decision Log

**Status:** M0 complete and approved by the owner on 2026-11-06. Implementation has started at M1. No deployment or paid resource has been created.
**Date:** 2026-11-06
**Scope:** backend only (Expo app and admin dashboard are separate deliverables).

## 1. Method and evidence

Read in full before review:

- `MASTER_PROMPT.md`, `README.md`, `package.json`, `tsconfig.json`, `wrangler.jsonc`, `.env.example`
- `docs/00`–`docs/08`
- `database/0001_initial_schema.sql`
- `src/index.ts`, `src/auth/google-token.ts`, `src/durable-objects/booking-room.ts`, `src/middleware/error-handler.ts`, `src/routes/health.ts`
- `test/google-token.test.ts`

Platform facts were checked against current official documentation (not memory). Sources:

| Topic | Source |
|---|---|
| Durable Objects limits / SQLite storage | https://developers.cloudflare.com/durable-objects/platform/limits |
| Durable Object state + Hibernation API | https://developers.cloudflare.com/durable-objects/api/state/ |
| Durable Object WebSocket best practices | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ |
| Workers Queues pricing (free plan since Feb 2026) | https://developers.cloudflare.com/queues/platform/pricing |
| Workers Rate Limiting binding | https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ |
| Neon serverless driver HTTP vs WebSocket | https://neon.com/docs/serverless/serverless-driver |
| Neon connection choice | https://neon.com/docs/connect/choose-connection |
| Neon Drizzle guide | https://neon.com/docs/guides/drizzle |
| Neon PostGIS | https://neon.com/docs/extensions/postgis |
| Google ID token validation | https://developers.google.com/identity/openid-connect/openid-connect |
| Google backend auth (multiple audiences) | https://developers.google.com/identity/sign-in/web/backend-auth |
| Cloudinary authentication signatures | https://cloudinary.com/documentation/authentication_signatures |
| Cloudinary signed uploads | https://cloudinary.com/documentation/upload_images |
| Expo push sending | https://docs.expo.dev/push-notifications/sending-notifications/ |
| Drizzle PostGIS geometry | https://orm.drizzle.team/docs/guides/postgis-geometry-point |

### Baseline commands actually run

| Command | Result |
|---|---|
| `npm install --no-audit --no-fund` | Passed; 106 packages; `package-lock.json` created |
| `npm run typecheck` | **FAILED** — `src/routes/health.ts(7,10): error TS18046: 'c.env' is of type 'unknown'.` |
| `npm test` | 1 file / 1 test passes, but the test only asserts `expect(true).toBe(true)`; it verifies nothing |
| `npm audit --omit=dev` | **FAILED** — 1 high, direct: `drizzle-orm@0.44.7` |
| `npm audit` | **FAILED** — 8 findings: 2 critical, 1 high, 5 moderate |

The scaffold therefore does **not** currently typecheck, and there is **no real test coverage**. Any later claim of passing tests must replace the placeholder first.

### Dependency audit detail

| Scope | Finding |
|---|---|
| Runtime | `drizzle-orm@0.44.7` — SQL injection via improperly escaped SQL identifiers (GHSA-gpj5-g38j-94v9), fixed in `>=0.45.2`. |
| Dev/test | `vitest@3.2.7` criticals via `tinypool@1.1.1` (prototype-pollution RCE gadget) and `@vitest/mocker` (path traversal / code injection); `drizzle-kit@0.31.11` moderates via deprecated `@esbuild-kit/*` and `esbuild`. |

Root cause of the runtime finding: `^0.44.0` on a `0.x` package allows only `>=0.44.0 <0.45.0`, so npm installed `0.44.7` rather than the current `0.45.4`. Remediation changes a direct dependency and needs a compatibility check, so it is recorded as decision D16 instead of being applied silently during M0. `npm audit fix --force` must not be used blindly; it proposes breaking and downgrade changes.

## 2. Verified platform constraints that shape the design

| # | Verified fact | Design consequence |
|---|---|---|
| P1 | Neon's serverless driver has an HTTP mode (one-shot queries, non-interactive transactions) and a WebSocket mode (`Pool`/`Client`, interactive transactions). In Workers a WebSocket connection cannot outlive a request. | Multi-step booking/dispatch transactions must use a per-request WebSocket `Pool` created and closed inside the handler, or be expressed as a single atomic SQL statement. HTTP mode cannot support read-then-write business transactions. |
| P2 | Drizzle exposes `neon-http` and `neon-serverless` adapters; the latter is required for interactive transactions. | Two DB access paths must be explicit, or all writes must use the WebSocket pool. Accidental use of the HTTP adapter for dispatch will silently break atomicity. |
| P3 | Durable Objects: Hibernation WebSocket API is recommended; max 32,768 WebSockets per object; memory is lost on hibernation; SQLite-backed DOs are the only backend on the Workers Free plan (1 GB/object; 10 GB/object paid); one alarm per object. | The booking room must use `ctx.acceptWebSocket`, store any needed state in SQLite/attachments, and stay per-booking. It must not hold authoritative booking state in memory. |
| P4 | Cloudflare Queues is available on the Workers Free plan (10,000 operations/day, 24 h retention) and paid plan (14-day retention); max 100 messages per batch. | Queues is a viable durable executor for outbox fan-out, push delivery, and delayed offer expiry. Using it adds a binding not present in the scaffold and should be approved. |
| P5 | The Workers Rate Limiting binding is per-Cloudflare-location, eventually consistent and explicitly approximate. | It is useful as coarse abuse control, but cannot be the sole control for login brute force or dispatch integrity. Sensitive limits need DB-backed counters or the DB's own constraints. |
| P6 | Google ID tokens must be signature-verified against Google JWKS and must have `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `aud` equal to one of the app's client IDs, and an unexpired `exp`. Multiple audiences are supported; `azp` identifies the presenter. ID tokens are ~1 hour and must not be used as session state. | `GOOGLE_CLIENT_ID` (singular) is insufficient for an Expo app that uses web/iOS/Android client IDs. The backend needs an allowlist and a session mechanism of its own. |
| P7 | Cloudinary signatures are computed server-side from all upload fields except `file`, `cloud_name`, `resource_type`, `api_key`, sorted by name, using SHA-1 by default (SHA-256 configurable), and are valid ~1 hour. The API secret never goes to the client. | Signature generation must use Web Crypto, not the Node SDK. The server should verify the resulting asset through the Admin API before trusting it. |
| P8 | Expo Push: `POST https://exp.host/--/api/v2/push/send`; max 100 messages/request; 600 notifications/sec/project; receipts via `/push/getReceipts`; `DeviceNotRegistered` must deactivate the token; optional Bearer access token. | `expo-server-sdk-node` is not Workers-native (Node HTTP/zlib). Implement with `fetch`, chunk to 100, and poll receipts out-of-band. |
| P9 | Neon supports PostGIS (not enabled by default; `CREATE EXTENSION postgis`; GiST indexes available), but Drizzle's spatial support covers `geometry`, not `geography`, with known SRID/migration bugs. | The proposed `geography(Point,4326)` is not safely usable with Drizzle as written. Prefer numeric lat/lon for the pilot, or `geometry` with a custom type and an explicit extension migration. |
| P10 | Workers Free plan: 100,000 requests/day. DO storage and Queues operations have separate free allowances. | Pilot load is likely fine on free tier, but response to an incident cannot rely on quota headroom. A paid plan decision is required before a public pilot. |

## 3. Scaffold assessment

### Sound decisions worth keeping

- Modular-monolith direction (`routes -> services -> repositories -> database`) is correct and matches the master prompt.
- Role/ownership checks are treated as server-derived, not client-supplied.
- Google token verification uses `jose`, pins `RS256`, validates issuer/audience, and does not trust decoded claims.
- Error handler avoids returning stack traces.
- CORS uses an explicit allowlist rather than `*`.
- The `dispatch_offers` partial unique index (`WHERE status = 'PENDING'`) is the right primitive for one active offer per booking.
- `bookings.version` provides an optimistic-concurrency hook.
- DO migration uses `new_sqlite_classes`, which is correct for a new SQLite-backed class.

### Defects found in existing code/config

| ID | Severity | Finding |
|---|---|---|
| C1 | High | `src/routes/health.ts` uses `new Hono()` without a `Bindings` generic, so `c.env` is `unknown`; `npm run typecheck` fails. |
| C2 | High | `test/google-token.test.ts` is a placeholder that asserts `true`. It gives false confidence and cannot be reported as auth coverage. |
| C3 | High | `database/0001_initial_schema.sql` declares `geography(Point, 4326)` but never runs `CREATE EXTENSION postgis`; the migration will fail on a fresh Neon database unless the extension is enabled separately. |
| C4 | High | There is no index supporting the dispatch candidate query. `partner_skills(category_code, verified)`, `partner_zone_memberships(zone_id)`, and an online-availability index are all missing. |
| C5 | High | `.env.example` starts with a literal `[TEMPLATE]` line. README instructs copying it to `.dev.vars`; that produces a malformed/meaningless variable. |
| C6 | Medium | CORS origin callback returns `''` for a disallowed origin. The documented rejection signal is to return no origin; an empty header is at best accidental, at worst creates an invalid header. |
| C7 | Medium | `GOOGLE_CLIENT_ID` is a single string. Native Expo builds present iOS/Android/web audiences; a single value will reject legitimate tokens (or force an insecure workaround). |
| C8 | Medium | `src/durable-objects/booking-room.ts` is a 501 placeholder with no auth, no hibernation, no sequence handling. It must not be deployed as-is. |
| C9 | Medium | `src/index.ts` mounts no request-ID, body-limit, rate-limit, or auth middleware; the only middleware is headers/CORS/error handling. |
| C10 | Medium | No `.dev.vars` / secret provisioning process beyond the example file; no documented `wrangler secret put` flow. |
| C11 | Low | `package.json` pins `@cloudflare/workers-types` to major 4 while major 5 is current, and TypeScript 5 while 7 is published. Versions are not automatically wrong, but the choice must be deliberate and pinned. |
| C12 | Low | No lint configuration, CI workflow, OpenAPI artifact, runbook, threat model, or load-test plan exists yet, though all are required deliverables. |
| C13 | Low | `GET /ready` only checks that `DATABASE_URL` is non-empty; it does not check database connectivity. |
| C14 | High | The resolved runtime dependency `drizzle-orm@0.44.7` is below the patched 0.45.2 and carries a direct high-severity SQL-injection advisory; dev tooling adds 2 critical and 5 moderate findings. |

## 4. Specification vs schema conflicts

`docs/07-data-model.md` lists entities that the migration does not create. This is a direct source-of-truth conflict and must be resolved before M1.

| Documented entity | In `0001_initial_schema.sql`? | Impact |
|---|---|---|
| `sessions` | **Missing** | No way to model login sessions, rotation, revocation. Blocks auth design. |
| `customer_profiles` | **Missing** | Doc lists it; schema has no customer profile table. Decide whether it is needed. |
| `partner_service_zones` | Present as `partner_zone_memberships` | Naming mismatch; pick one name. |
| `booking_quote_items` | **Missing** | Additional-work quotes cannot store line items/evidence as specified in `docs/03`. |
| `dispatch_attempts` | **Missing** | Retry budget, attempt history and "route exhaustion to admin" are not modelable. |
| `notification_deliveries` | **Missing** | Push retry/receipt state cannot be persisted as required by `docs/05`. |

Other schema gaps and integrity issues:

| ID | Severity | Finding |
|---|---|---|
| S1 | High | No configuration table for offer timeout, max attempts, workload limit, service radius, ranking weights, or quiet hours, although `docs/04` requires these to be configurable. |
| S2 | High | No pricing model beyond `service_items.base_price` (nullable). Nothing supports travel fees, add-ons, taxes, or the rule "backend computes all prices"; `bookings.quoted_total` is nullable. |
| S3 | High | `bookings.address_id` references a mutable address row. Editing an address rewrites history. Snapshot the service address (and lat/lon) on the booking. |
| S4 | High | `partner_skills.category_code` is free text with no FK to `service_categories.code`; invalid skills can be stored. |
| S5 | Medium | `bookings.partner_user_id` and `dispatch_offers.partner_user_id` reference `users`, not `partner_profiles`; a non-partner can be assigned if application logic regresses. |
| S6 | Medium | `partner_availability.active_job_count` is a denormalized counter with no reconciliation; it will drift under failures. |
| S7 | Medium | Two suspension sources of truth: `users.account_disabled` and `partner_profiles.status = 'SUSPENDED'`. Precedence is undefined. |
| S8 | Medium | `users.email` is nullable and not unique; Google `sub` is unique. Account duplication/linking policy is undefined. |
| S9 | Medium | `service_zones.boundary_geojson` exists but dispatch is specified to use zone membership. Whether polygons are authoritative, display-only, or validation-only is undefined. |
| S10 | Medium | `idempotency_keys` duplicates the booking-level `UNIQUE(customer_user_id, idempotency_key)`. Scope, payload-mismatch behavior, TTL and cleanup are undefined. |
| S11 | Medium | `media_assets` has no association to a booking/partner/document, no MIME/size/format metadata, and `verified` has no verifier/timestamp. |
| S12 | Medium | `admin_audit_logs` lacks request ID, IP/user agent, and immutability/retention controls; audit writes are not tied to the mutation transaction. |
| S13 | Medium | `notification_deliveries` absence also means no receipt tracking or dead-token cleanup record. |
| S14 | Low | Missing indexes: `addresses` FK is indexed, but `bookings.address_id`, `push_tokens(user_id)`, `media_assets(owner_user_id)`, and `dispatch_offers(booking_id)` (non-partial paths) are not. |
| S15 | Low | `currency char(3)` has no `CHECK (currency = 'INR')`; `country_code` likewise. |
| S16 | Low | `CREATE TYPE` statements are not idempotent and there are no down migrations; the deliverable requires reversible migrations. |
| S17 | Low | `bookings.status = 'DISPUTED'` has no defined transitions or resolution owner. |
| S18 | Low | No `updated_at` trigger/strategy; every repository must remember to set it. |

## 5. Architecture review by concern

### 5.1 Request path and module boundaries

Proposed: `app -> middleware (request ID, CORS, body limit, auth, rate limit, error) -> route (Zod) -> service (authorization + invariants) -> repository (SQL) -> Postgres`.

Required corrections:

- Put `Env` in one `src/env.ts` module and type every Hono instance with it. This is what C1 exposes.
- Authorization must live in the service layer with an explicit policy function per command, not only in route guards. Route guards are easy to forget when a new route is added.
- Repositories must accept an executor/transaction handle so a service can compose multiple writes atomically.

### 5.2 Database access and transactions

Two adapters are needed, and the choice must be deliberate:

- `neon-http` for single-statement reads and independent writes (fastest, no session).
- `neon-serverless` `Pool` for any flow with read-then-write invariants (offer accept, state transitions, quote acceptance, admin override).

Constraints:

- Never create a module-scope `Pool`; Workers cannot keep the WebSocket across requests.
- Create the pool per request, `await client.connect()`, run the transaction, and close it in `finally`. Treat connection setup as part of the latency budget.
- Prefer a single atomic `UPDATE ... WHERE status = ... RETURNING ...` where it removes the need for an interactive transaction.
- On Neon free tier, compute autosuspend can add cold-start latency; the Worker's region and Neon region must be aligned (Mumbai/ap-south-1 is the likely pilot choice). This is a deployment decision, not a code detail.

### 5.3 Booking state machine

The documented lifecycle is sound, but the transition table is not specified. Before implementation, the owner must define:

- Who may trigger each transition (customer, assigned partner, admin).
- Whether `COMPLETION_PENDING` requires customer confirmation or auto-completes after a timeout.
- Whether cancellation is allowed in each state and what the fee policy is (V1 has no payment execution).
- Whether `NO_PARTNER_AVAILABLE` is terminal or retryable.
- How `DISPUTED` is entered/exited.

Implementation requirements:

- Every transition is a command with actor, reason, idempotency key.
- Transition + `booking_events` insert + outbox insert happen in one transaction.
- `sequence` is allocated inside that transaction while holding the booking row (`SELECT ... FOR UPDATE` or conditional update on `version`), never by a separate `MAX(sequence)+1` read.
- Clients never send `status`.

### 5.4 Dispatch engine

The hard-filter list in `docs/04` is implementable, but correctness depends on transaction design:

1. Eligibility query: approved profile + verified category + zone membership + online + not suspended/disabled + `active_job_count < limit` + no prior decline/exhausted policy.
2. Ranking is computed in the Worker after the filtered candidate set is fetched (bounded, e.g. top 50), not in a per-candidate N+1 loop.
3. Offer creation must be one transaction that (a) confirms the booking is still `DISPATCHING` and unassigned, (b) inserts the offer, (c) writes an event/outbox row. The partial unique index is the last line of defense, not the primary check.
4. Accept must be one transaction with conditional updates:
   - `UPDATE dispatch_offers SET status='ACCEPTED' WHERE id=? AND status='PENDING' AND expires_at > now() RETURNING ...`
   - `UPDATE bookings SET partner_user_id=?, status='PARTNER_ASSIGNED', version=version+1 WHERE id=? AND status='DISPATCHING' AND partner_user_id IS NULL RETURNING ...`
   - If either returns zero rows, roll back and return a stable conflict result.
5. Expiry/retry needs a durable executor. The Worker has no durable timer; in-memory timers are forbidden by the spec. Options are in §6 D4.
6. `dispatch_attempts` must exist to enforce the retry budget and to route exhaustion to admin.

### 5.5 Realtime

The design is viable with the following constraints:

- One Durable Object per booking. Use `ctx.acceptWebSocket` (Hibernation API); do not use standard `ws.accept`.
- The DO never mutates booking state. The Worker commits the DB transaction first, then calls the DO stub to publish; if that call fails, the outbox retries.
- Handshake authorization: short-lived, booking-scoped, single-use ticket signed by the Worker (HMAC or EdDSA), carrying `bookingId`, `userId`, `role`, `exp`, `jti`. Do not put long-lived access tokens in URLs. Prefer `Sec-WebSocket-Protocol` or a one-time ticket because query strings land in logs.
- Re-check participation on every reconnect. The DO can verify the ticket signature itself with a shared secret binding; it must not call Postgres on every message.
- Events carry `eventId`, `bookingId`, `sequence`, `type`, `occurredAt`, `schemaVersion`, and a minimal payload. No addresses, phone numbers, documents, or private notes.
- Delivery is at-least-once. Clients dedupe by `eventId`/`sequence` and recover via `GET /bookings/:id/events?afterSequence=`.
- Rate-limit client messages and reject any client-originated state mutation.
- A booking with no connected clients costs nothing while hibernating; fan-out to zero sockets is fine.

### 5.6 Notifications and outbox

- Outbox row is written in the same transaction as the domain change.
- A consumer (Queue or cron) reads unprocessed rows with `FOR UPDATE SKIP LOCKED`, performs the side effect, marks processed, and retries with backoff.
- Push is best-effort: chunk to 100, persist tickets, poll receipts later, deactivate `DeviceNotRegistered` tokens.
- A push being accepted is not evidence of delivery; never derive booking state from push.
- `notification_deliveries` is required to make retries and receipt reconciliation observable.

### 5.7 Media

- Server returns only `timestamp`, `signature`, `api_key`, `cloud_name`, `folder`, `allowed_formats`, `max_bytes`/preset. Secret stays server-side.
- Sign the exact fields the client will send; any mismatch invalidates the signature.
- Verify the uploaded asset through Cloudinary's Admin API (public_id, format, bytes, folder) before marking it verified and attaching it.
- Identity documents belong in a restricted folder; deliver via short-lived signed URLs or authenticated proxy, never public IDs.
- Do not collect Aadhaar.

### 5.8 Admin

- Admin is a role in the DB, granted only by an operator bootstrap procedure. There is no public path to `ADMIN`.
- Every admin mutation requires a reason and writes an audit row in the same transaction.
- Consider Cloudflare Access in front of the admin dashboard as an additional layer; it is an extra service decision, not part of the fixed stack.

## 6. Decisions requiring approval

Blocking decisions must be resolved before M1/M3/M4. Each has a recommendation; approval can be "accept all recommendations" or per-item overrides.

| ID | Decision | Recommendation | Why / impact | Blocks |
|---|---|---|---|---|
| D1 | Session mechanism after Google sign-in | Opaque 32-byte session token, SHA-256 hash stored in `sessions`, 30-day absolute / 7-day idle expiry, rotation on refresh, revoke on logout; sent as `Authorization: Bearer`. | Revocable immediately, no signing-key rotation, role lookup already needed per request. JWT+refresh is the alternative but adds complexity without a clear benefit at pilot scale. | M1 |
| D2 | Google audience set and replay protection | `GOOGLE_CLIENT_IDS` comma-separated allowlist (web, iOS, Android, Expo); verify `aud` ∈ allowlist, `azp` if present ∈ allowlist, `email_verified`; require single-use server-issued `nonce` for native login stored ~10 min. | A single client ID will reject real native tokens. ID tokens live ~1 hour, so replay protection is required for a login endpoint. | M1 |
| D3 | DB access strategy | `neon-http` for one-shot queries; `neon-serverless` per-request `Pool` only for interactive transactions, closed in `finally`; no cross-request pooling. | This is the only way to get true atomicity for dispatch/state transitions in Workers. | M1/M4 |
| D4 | Durable executor for outbox, push retries, offer expiry | Cloudflare Queues (now on free tier) for outbox fan-out and delayed offer-expiry messages, with the outbox table as the source of truth; consumer re-reads DB and runs an idempotent command. | Worker timers are not durable; DO alarms exist but would make the room own dispatch timing and are limited to one alarm per object. Confirm the added binding is acceptable. | M4/M5 |
| D5 | Location/geospatial representation | Do not depend on PostGIS in V1. Store `latitude`/`longitude` as `numeric(9,6)` on partner availability and address, filter by bounding box, rank by Haversine in the Worker. Keep zone eligibility as membership. | Drizzle does not support `geography` reliably, `geometry` has SRID/migration bugs, and the extension is not created by the migration. Revisit PostGIS if radius queries become hot. | M1/M4 |
| D6 | Money representation | `numeric(12,2)` in Postgres; parse to integer paise in domain code; never use JS floats; explicit `INR` check. | Matches the spec's decimal requirement and avoids rounding drift. | M1/M3 |
| D7 | Admin bootstrap and authentication | `admin_audit_logs` + role grant via an operator-run SQL/CLI procedure using a verified Google `sub`; 8-hour admin sessions; optional Cloudflare Access in front of the dashboard. | No self-service admin path; auditable bootstrap. Access is an extra service decision. | M1/M6 |
| D8 | Rate limiting | Native Workers rate-limit binding for coarse per-IP/per-route abuse; DB-backed counters for login and sensitive mutations; WAF managed rules at the edge. | The native binding is approximate and per-location; it cannot be the sole control for credential attacks or offer spam. | M1 |
| D9 | Media verification and document privacy | Signed uploads only; server-side Admin API verification before `verified=true`; private folder + short-lived delivery for documents; no Aadhaar. | Prevents attaching arbitrary/unverified assets and keeps identity documents out of public delivery. | M2 |
| D10 | Partner location retention | Collect only while online or on an active job; round/coarsen when idle; delete or expire after a configured window (e.g. 24 h); explicit consent copy. | Precise location is sensitive personal data; the default in `docs/00` requires minimization. | M4 |
| D11 | Idempotency semantics | `Idempotency-Key` required on all POSTs; scope `(actor, route)`; store request hash; same key + different payload → 409; 24 h TTL with cleanup; redact response bodies containing PII. | Prevents double bookings and double accepts while keeping stored data bounded. | M1/M3 |
| D12 | Email uniqueness and account linking | `citext` unique email only for `email_verified=true`; never auto-link an unverified email; otherwise separate accounts keyed by Google `sub`. | Prevents account takeover by unverified email and duplicate-account surprises. | M1 |
| D13 | City/zone configuration source | DB config seeded with Bareilly disabled-by-default policies enabled per environment; no environment-variable business gating; validate city/zone on booking creation and dispatch. | Matches `docs/00` and keeps admin control explicit. | M2 |
| D14 | Cloudflare plan for pilot | Workers Paid ($5/month minimum) before a public pilot; document free-tier caps if not approved. | DO, Queues, higher limits, and predictable behavior under incident load. This is a budget decision. | M4/M5 |
| D15 | Completion/cancellation policy | Customer confirms completion within 24 h; auto-complete after 24 h without dispute; no cancellation fees in V1 (no payment execution). | Defines the missing state-machine edges and avoids implementing a policy the owner has not approved. | M3 |
| D16 | Dependency remediation | Pin `drizzle-orm` to `^0.45.4` in M1 and verify the 0.44 -> 0.45 schema/query API compatibility; upgrade `vitest` to `^5.1.0` (or apply a vetted `tinypool` override); track the `drizzle-kit`/`esbuild` dev-only advisory; make `npm audit --omit=dev` a CI gate. Do not use `npm audit fix --force`. **Applied in M1:** `drizzle-orm@0.45.4`, `vitest@5.1.0`, `vite` peer added; runtime audit clean. | The lockfile ships a known SQL-injection advisory in a direct runtime dependency, and dev-tool findings affect test/CI execution. | M1 |

## 7. Proposed milestone plan after approval

| Milestone | Content | Exit criteria |
|---|---|---|
| M1 — Foundation | Typed `Env`; reconciled Drizzle schema + reversible initial migration (including PostGIS decision, missing tables/indexes, config); session auth; multi-audience Google verification + nonce; RBAC/ownership middleware; request IDs, redacted structured logs, body limits, CORS fix; error envelope; `.env.example` fix; real Vitest setup; lint; CI (typecheck, tests, lint, `npm audit`). | `typecheck`, `test`, `lint` pass; auth/session/authorization tests exist and fail closed; migration applies to a scratch Neon branch and rolls back. |
| M2 — Catalogue & partners | Cities/zones/categories/items; partner onboarding, skills, documents; admin approval; audit; Cloudinary signature + verification. | Authorization matrix tests; approval/suspension gates; signed-upload tests. |
| M3 — Bookings | Server-side pricing; booking creation with address snapshot; idempotency; state machine; events; quotes/additional work; cancellation. | Transition allow/deny matrix; duplicate submit; stale quote; concurrent version conflict. |
| M4 — Dispatch | Eligibility query + indexes; ranking; offers; accept/reject/expire; retry budget; admin override; queue/cron executor. | No candidates, timeout, rejection, duplicate accept, simultaneous accept, suspension mid-offer, exhaustion-to-admin. |
| M5 — Realtime & push | Booking DO room; tickets; sequence/recovery; outbox; Queues; Expo push + receipts + dead tokens. | Unauthorized socket rejected; reconnect recovery; duplicate dedupe; revoked access; push retry/dead token. |
| M6 — Admin & release readiness | Admin APIs, audit review, OpenAPI, runbooks, backup/restore drill, load-test plan and baseline, threat model, security checklist. | Documented drills completed; no unverified production claims. |

## 8. Risks and explicit non-claims

- This review is a design assessment, not a security certification. No penetration test, load test, backup/restore drill, or legal review has been performed.
- "Unhackable", "zero latency" and "always available" are not achievable; the architecture targets defense in depth and measurable SLOs.
- Pilot performance targets (p95 300 ms reads / 700 ms writes, <5 s first offer) are unvalidated. Neon region, connection setup, and Cloudflare placement will dominate.
- Cloudflare, Neon, Cloudinary and Expo quotas/pricing can change; free-tier behavior is not a production SLA.
- Expo push is best-effort. Cloudinary delivery is third-party. Neither is authoritative state.
- The current scaffold must not be deployed publicly: it fails typecheck, has no real tests, and exposes a 501 placeholder DO.
- **No payment gateway, wallet, escrow, payout, Aadhaar collection, R2, Firebase Auth, or phone OTP is included or implied by this review.**

## 9. Approval checklist

Reply with either "approve all recommendations" or overrides per ID.

- [ ] D1 session mechanism
- [ ] D2 Google audiences + nonce
- [ ] D3 Neon HTTP vs WebSocket transaction strategy
- [ ] D4 Cloudflare Queues as durable executor (adds binding)
- [ ] D5 numeric lat/lon instead of PostGIS geography
- [ ] D6 numeric INR / integer paise
- [ ] D7 admin bootstrap and session policy
- [ ] D8 rate-limit split (native + DB)
- [ ] D9 Cloudinary verification + private documents
- [ ] D10 partner location retention
- [ ] D11 idempotency semantics/TTL
- [ ] D12 email uniqueness/linking
- [ ] D13 DB-driven city/zone config
- [ ] D14 Workers Paid for pilot
- [ ] D15 completion/cancellation policy
- [ ] D16 dependency remediation (drizzle-orm/vitest advisory)
- [ ] Approve starting M1

Until explicit approval is received, no schema, route, service, migration, or test implementation will begin.
