# 11 — M2 Catalogue, Partners, Admin Audit and Media

**Status:** M2 implementation complete — awaiting approval to start M3.
**Date:** 2026-11-06
**Approval basis:** The owner approved M2 after M1. No deployment, paid resource, production database change, live Cloudinary call, or migration execution was performed.

## 1. What was delivered

| Area | Delivered |
|---|---|
| Catalogue | Public reads for enabled cities, zones, categories and items. Admin mutations create zones, categories and items and enable/disable cities. Admin reads can include disabled catalogue rows. |
| Partner onboarding | `POST /v1/partner/onboarding` validates that the city and every selected skill are enabled, grants `PARTNER`, and writes a `PENDING_REVIEW` profile with unverified skills. Re-submitting preserves an `APPROVED` profile status; a `SUSPENDED` partner is refused. |
| Partner review | Admin list, detail, approval and suspension routes. Approval only succeeds from `PENDING_REVIEW`, can verify all submitted skills, and sends the partner offline on suspension. Both mutations write an audit row in the same database transaction as the profile change. |
| Admin authorization | Every `/v1/admin/*` route is behind `createRequireAuth` and `requireRole('ADMIN')`. Roles come from the session's database user, never from client input. There is no public admin path. |
| Audit logging | `admin_audit_logs` rows record actor, action, target, reason, metadata, request ID, SHA-256 IP hash and truncated user agent. Audit reads use descending keyset pagination. |
| Media signatures | `POST /v1/media/signature` supports `AVATAR` and `PARTNER_DOCUMENT`. It signs Cloudinary SHA-1 parameters over sorted `public_id`, `timestamp` and optional `type`; avatars use `upload`, partner documents use `authenticated`. |
| Upload verification | `POST /v1/media/confirm` checks the asset is owned by the caller, calls the Cloudinary Admin API, and verifies public ID, resource type, upload type, folder, format and byte limits before marking the asset verified. |
| Persistence | `createPlatformStore` implements the platform contract with Drizzle/Neon: HTTP queries for reads and a per-request WebSocket pool for interactive transactions. Keyset cursors are used for partner and audit lists. |
| Tests | 12 new M2 tests cover public catalogue filtering, admin 401/403/201 boundaries, category uniqueness, partner onboarding validation, approval and skill verification, suspension audit, invalid cursors, Cloudinary signature correctness, private document gating, metadata/size enforcement and media ownership. |

No schema change was required in M2. The generated `0000_initial_schema.sql` and its rollback remain the only migration pair.

### Media rules

| Kind | Cloudinary folder | Type | Maximum | Formats |
|---|---|---|---|---|
| `AVATAR` | `fixyes/avatars/<userId>/<uuid>` | `upload` | 5 MiB | jpg, jpeg, png, webp |
| `PARTNER_DOCUMENT` | `fixyes/partner-documents/<userId>/<uuid>` | `authenticated` | 10 MiB | jpg, jpeg, png, webp |

The signature is valid for one hour and is returned with the Cloudinary API key, cloud name and upload URL. A media row is created when the signature is issued and remains unverified until the Admin API confirms the uploaded object.

## 2. Verification actually run

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** (exit 0) |
| `npm run lint` | **Pass** (exit 0) |
| `npm test` | **Pass** — 53 tests / 7 files, 0 failed |
| `npm run db:check` | **Pass** — Drizzle reports migration consistency |
| `npm audit --omit=dev` | **Pass** — 0 runtime vulnerabilities |
| `npx wrangler deploy --dry-run` | **Pass** — bundle 1395.12 KiB (260.55 KiB gzip); `BOOKING_ROOM`, `AUTH_RATE_LIMITER` and vars recognized |

### What the M2 tests prove

- Enabled-only public catalogue responses; invalid city query rejected; disabled city and skill rejected during onboarding.
- Admin routes reject missing sessions and customer tokens, accept an admin session, and create a category with an audit row containing the actor and request ID.
- Duplicate category codes map to `409 CATEGORY_EXISTS`.
- Onboarding creates `PENDING_REVIEW`; admin approval verifies skills and writes `PARTNER_APPROVED`; suspension requires a reason and writes `PARTNER_SUSPENDED`.
- Invalid partner cursors return `400 INVALID_CURSOR`.
- Cloudinary SHA-1 signatures can be independently reproduced; private documents require a partner profile; confirmation enforces ownership, type, format, folder and size; another user cannot confirm the asset.

Tests use the in-memory platform contract implementation. They do not execute the Drizzle/Neon SQL or call Cloudinary.

## 3. Files changed

**Added**

- `src/platform/store.ts` — Drizzle/Neon platform store with transactional admin mutations and audit rows
- `src/platform/services.ts` — catalogue, partner, audit and media services
- `src/media/cloudinary.ts` — SHA-1 signing and Admin API client
- `src/routes/catalogue.ts`, `src/routes/partner.ts`, `src/routes/admin.ts`, `src/routes/media.ts`
- `test/helpers/in-memory-platform-store.ts`
- `test/m2-platform.test.ts`
- `docs/11-m2-platform.md`

**Updated**

- `src/app.ts`, `src/index.ts` — platform wiring and protected route mounts
- `src/lib/validation.ts`, `src/lib/cursor.ts`, `src/lib/db-errors.ts`, `src/platform/types.ts`, `src/platform/store-contract.ts` — M2 helpers and contracts
- `test/helpers/in-memory-auth-repository.ts` — generated user IDs are UUIDs, matching production IDs and route parameter validation
- `README.md`, `docs/06-api-contract.md` — M2 route surface and limitations

## 4. Deviations and deferred items

| Item | Status |
|---|---|
| Admin bootstrap | M2 authorizes admins but does not create one. Granting `ADMIN` remains an operator database procedure until the M6 bootstrap. |
| Media cleanup | Signatures create unverified media rows; there is no scheduled cleanup for abandoned uploads yet. |
| Partner documents review UI | Documents are verified as uploaded, but there is no admin document-review decision or storage of a verification verdict. |
| Zone geometry | The API stores GeoJSON and checks the city exists, but does not validate polygon topology or enforce zone membership. Dispatch uses zones in M4. |
| Partner availability | Suspension forces availability offline; the partner availability API is deferred to M3. |
| Catalogue item pricing | `basePrice` is nullable and stored as `numeric(12,2)`; server-authoritative quote calculation is deferred to M3. |
| Rate limiting | Admin and media mutations have no dedicated rate-limit bucket yet; the auth routes retain the native binding. |
| Idempotency | Admin mutations are not idempotency-key protected; the table and TTL exist for booking routes in M3. |
| Email account linking | Unchanged from M1; still awaiting a product decision. |

## 5. Limitations and risks

- **No live PostgreSQL execution.** There is no `DATABASE_URL`, and `psql`/Docker are unavailable on this machine. `drizzle-kit check` validates journal consistency, not SQL. The migration and all Drizzle store queries must be exercised on a scratch Neon branch before any shared environment.
- **No real Cloudinary call.** Signatures and verification are tested against a fake Admin API client. Cloudinary's response fields, authenticated-resource URL encoding and account-specific policies are not verified live.
- **No deployment.** The Wrangler dry-run proves bundling and binding configuration, not runtime behavior against Neon or Cloudinary.
- **No admin user exists through an API.** Until M6, the first admin must be inserted by an operator with a controlled SQL procedure.
- **No load, penetration, backup/restore, or legal review.** Quotas and platform limits are not production SLAs.
- **Unverified media can accumulate.** Abandoned signed uploads are not expired or deleted.
- **Audit IP hashing is unsalted SHA-256.** It reduces direct exposure but is not anonymization against a determined attacker with a small IP space.

## 6. Next approval

M3 would add address storage, booking creation with idempotency, server-authoritative quote/price handling, the booking state machine and customer cancellation, with tests for each transition and ownership boundary. No M3 code starts without approval.
