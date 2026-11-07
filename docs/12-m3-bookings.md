# 12 — M3 Addresses, Booking Creation and State Machine

**Status:** M3 implementation complete. M4 was subsequently approved and is documented in `docs/13-m4-dispatch.md`.
**Date:** 2026-11-06
**Approval basis:** The owner approved M3: address storage, booking creation with idempotency, server-authoritative pricing and the booking state machine. No deployment, database migration, Neon connection or paid resource was used.

## 1. What was delivered

| Area | Delivered |
|---|---|
| Addresses | Authenticated users can create, list, update and delete their own addresses. Every read and write is scoped by `user_id`; another user receives `404`. Addresses used by a booking cannot be deleted. |
| Booking creation | `POST /v1/bookings` requires `Idempotency-Key`, an owned address and an enabled service item. The booking starts at `REQUESTED` with version `1`. |
| Server pricing | The client cannot send a price. The server reads the enabled item’s `base_price`, converts the INR decimal to integer paise, normalises it back to `numeric(12,2)` format and stores it as `quoted_total`. Null, disabled or non-INR pricing is refused. |
| Address snapshot | The address line, locality, city, state, postal code and coordinates are copied into the booking. Later address edits do not rewrite booking history. |
| Serviceability | The address city and state must match an enabled `service_cities` row. The item must be enabled, and its category must be enabled. Zone geometry validation remains deferred to dispatch. |
| Scheduling | `scheduledAt` is optional; a past time is rejected with a one-minute clock-skew allowance. |
| Idempotency | `idempotency_keys` stores the actor, key, request hash, response body and 24-hour expiry. Replaying the same key and request returns the existing booking with `200` and `Idempotent-Replay: true`. Reusing the key with a different request returns `409 IDEMPOTENCY_CONFLICT`. Keys are scoped per actor. A unique booking key plus unique `idempotency_keys` row protects concurrent retries. |
| Booking reads | Customers, the assigned partner and admins can read a booking and its ordered append-only events. Unrelated users receive `403`; missing bookings receive `404`. |
| State machine | Transitions are server commands validated by `src/domain/booking-state.ts`. The store conditionally updates `status` and `version` and appends one `booking_events` row with `sequence = new version`, inside a transaction. |
| Customer commands | The customer can cancel through `IN_PROGRESS` and confirm `COMPLETION_PENDING -> COMPLETED`. Cancellation from `COMPLETION_PENDING` is refused. |
| Partner commands | The assigned partner can move `PARTNER_ASSIGNED -> PARTNER_ACCEPTED -> ON_THE_WAY -> ARRIVED -> IN_PROGRESS -> COMPLETION_PENDING`. The partner can cancel through `ARRIVED`; a cancellation reason is mandatory. |
| Optimistic concurrency | Any transition may carry `expectedVersion`. A stale version returns `409 BOOKING_VERSION_CONFLICT`; a race at the store returns `409 BOOKING_CONFLICT`. |
| Tests | 14 new M3 tests cover address ownership and validation, in-use deletion, server pricing, address snapshots, idempotent replay and conflict (including replay after the item is disabled), per-user key scoping, city/item/category/schedule rejection, booking access, customer cancellation and completion, the full partner chain, invalid transitions, stale versions, transition permissions and INR unit conversion. |

No schema change was required in M3. The existing `addresses`, `bookings`, `booking_events` and `idempotency_keys` tables and the `booking_status` enum are sufficient. The generated `0000_initial_schema.sql` and rollback remain the only migration pair.

## 2. API added

All routes require `Authorization: Bearer <session>`.

| Method and path | Actor | Behaviour |
|---|---|---|
| `GET /v1/addresses` | Any authenticated user | Lists only the caller’s addresses. |
| `POST /v1/addresses` | Any authenticated user | Creates an address. Coordinates must be supplied together; PIN code is a 6-digit Indian PIN. |
| `PATCH /v1/addresses/:addressId` | Address owner | Updates supplied fields only. Coordinates must be supplied together. |
| `DELETE /v1/addresses/:addressId` | Address owner | Returns `204`; returns `409 ADDRESS_IN_USE` when a booking references the address. |
| `POST /v1/bookings` | `CUSTOMER` | Requires `Idempotency-Key`. Body: `serviceItemId`, `addressId`, optional `scheduledAt`. Rejects extra fields, including client prices. |
| `GET /v1/bookings/:bookingId` | Customer owner, assigned partner, admin | Returns the booking. |
| `GET /v1/bookings/:bookingId/events?afterSequence=N` | Customer owner, assigned partner, admin | Returns up to 200 ordered events after the sequence. |
| `POST /v1/bookings/:bookingId/cancel` | Customer owner | Body: optional `reason`, optional `expectedVersion`. |
| `POST /v1/bookings/:bookingId/complete` | Customer owner | Body: optional `expectedVersion`. Only from `COMPLETION_PENDING`. |
| `POST /v1/partner/bookings/:bookingId/status` | Assigned `PARTNER` | Body: `status`, optional `reason`, optional `expectedVersion`. Partner statuses are `PARTNER_ACCEPTED`, `ON_THE_WAY`, `ARRIVED`, `IN_PROGRESS`, `COMPLETION_PENDING`, `CANCELLED_BY_PARTNER`. |

`Idempotent-Replay` is exposed through CORS. Responses keep the existing `{ data }`-style envelopes: `{ address }`, `{ addresses }`, `{ booking }` and `{ events }`.

## 3. State transitions implemented

| From | To | Actor |
|---|---|---|
| `REQUESTED` | `CANCELLED_BY_CUSTOMER` | Customer |
| `DISPATCHING` | `CANCELLED_BY_CUSTOMER` | Customer |
| `PARTNER_ASSIGNED` | `PARTNER_ACCEPTED`, `CANCELLED_BY_PARTNER`, `CANCELLED_BY_CUSTOMER` | Partner, partner, customer |
| `PARTNER_ACCEPTED` | `ON_THE_WAY`, `CANCELLED_BY_PARTNER`, `CANCELLED_BY_CUSTOMER` | Partner, partner, customer |
| `ON_THE_WAY` | `ARRIVED`, `CANCELLED_BY_PARTNER`, `CANCELLED_BY_CUSTOMER` | Partner, partner, customer |
| `ARRIVED` | `IN_PROGRESS`, `CANCELLED_BY_PARTNER`, `CANCELLED_BY_CUSTOMER` | Partner, partner, customer |
| `IN_PROGRESS` | `COMPLETION_PENDING`, `CANCELLED_BY_CUSTOMER` | Partner, customer |
| `COMPLETION_PENDING` | `COMPLETED` | Customer |

The table in `src/domain/booking-state.ts` also contains admin and system transitions for later routes. No admin booking command is exposed in M3, and dispatch transitions remain M4.

## 4. Verification actually run

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** (exit 0) |
| `npm run lint` | **Pass** (exit 0) |
| `npm test` | **Pass** — 67 tests / 8 files, 0 failed |
| `npm run db:check` | **Pass** — Drizzle reports migration consistency |
| `npm audit --omit=dev` | **Pass** — 0 runtime vulnerabilities |
| `npx wrangler deploy --dry-run` | **Pass** — Worker bundle and bindings recognized |

### What the tests prove

- Address CRUD is owner-scoped; another user cannot list, patch or delete an address; invalid coordinates and PIN codes are rejected; an address referenced by a booking cannot be deleted.
- Booking creation ignores client pricing, rejects extra price fields, stores the server-derived `299.00` total and snapshots the address before later edits.
- Idempotent replay returns the same booking with `200` and the replay header; a changed request returns `409`; a different customer may use the same key; a new key creates a new booking.
- Missing or malformed keys, disabled cities, disabled items, disabled categories, null prices and past schedules are rejected with stable error codes.
- Booking and event reads are limited to the customer, assigned partner and admin; unrelated users get `403`; missing ids get `404`.
- Customer cancellation and completion write append-only events with the next sequence; stale versions, terminal states and `COMPLETION_PENDING` cancellation are refused.
- The assigned partner can complete the full chain to `COMPLETION_PENDING`, then the customer completes it. Non-assigned partners and customers cannot use the partner command; partner cancellation requires a reason and is refused from `IN_PROGRESS`.
- INR parsing uses integer paise and does not depend on floating point.

Tests use the in-memory platform contract implementation. They do not execute Drizzle/Neon SQL.

## 5. Files changed

**Added**

- `src/domain/money.ts` — INR-to-paise conversion and normalisation
- `src/domain/booking-state.ts` — role-aware transition matrix
- `src/lib/idempotency.ts` — required `Idempotency-Key` validation
- `src/platform/booking-services.ts` — address and booking application services
- `src/routes/addresses.ts`, `src/routes/bookings.ts`, `src/routes/partner-bookings.ts`
- `test/m3-bookings.test.ts`
- `docs/12-m3-bookings.md`

**Updated**

- `src/platform/store.ts` — Drizzle address, service-item, booking, event and transition methods
- `src/platform/store-contract.ts`, `src/platform/types.ts` — M3 contracts and domain types
- `src/app.ts`, `src/index.ts`, `src/middleware/cors.ts` — service wiring, auth mounts and replay header
- `src/lib/db-errors.ts` — foreign-key violation helper
- `test/helpers/in-memory-platform-store.ts` — M3 contract implementation and `seedBooking`
- `test/m2-platform.test.ts` — platform service fixture
- `README.md`, `docs/03-booking-state-machine.md`, `docs/06-api-contract.md` — M3 surface and policy notes

## 6. Deviations and deferred items

| Item | Status |
|---|---|
| Dispatch | `REQUESTED -> DISPATCHING`, partner assignment and offers remain M4. |
| Zone geometry | Booking checks only the enabled city; polygon and zone-membership checks are deferred to dispatch. |
| Auto-completion | No scheduler moves `COMPLETION_PENDING` to `COMPLETED` after 24 hours. The customer command is implemented; the timeout job is deferred. |
| Admin booking commands | Admin cancellation exists in the transition table but has no route or admin UI yet. |
| Disputes | `DISPUTED` exists in the enum and table but has no M3 command. |
| Additional work / quotes | No quote submission or acceptance route was added. |
| Payments, wallet, escrow, payout | Out of scope and not implemented. |
| Push and realtime | No booking room events or Expo Push deliveries yet. |
| Booking list | No `GET /v1/bookings` list endpoint was requested in M3. |
| Rate limiting | Booking creation and transitions have no dedicated rate-limit bucket yet. |

## 7. Limitations and risks

- **No live PostgreSQL execution.** There is no `DATABASE_URL`, and `psql`/Docker are unavailable on this machine. The migration and the new Drizzle queries, including `SELECT ... FOR UPDATE` and conditional updates, must be exercised on a scratch Neon branch before any shared environment.
- **No deployment.** The Wrangler dry-run proves bundling and binding configuration, not runtime behaviour against Neon.
- **Idempotency race handling is transaction-based but not load-tested.** Concurrent duplicate creates rely on the unique keys and the catch path; no concurrency or load test has run against PostgreSQL.
- **Clock-skew allowance is one minute.** A schedule more than one minute in the past is rejected. The product may want a stricter future-lead-time rule.
- **Address city matching is textual.** It compares trimmed city and state case-insensitively against `service_cities`; it does not yet resolve aliases or validate polygons.
- **No admin bootstrap.** Granting `ADMIN` remains an operator database procedure until M6.
- **No load, penetration, backup/restore or legal review.** Platform quotas are not production SLAs.

## 8. Next approval

M4 was approved after M3: dispatch moves `REQUESTED` to `DISPATCHING`, selects ranked candidates, creates expiring offers, supports partner accept/reject, admin assign/reassign and cron-driven expiry. See `docs/13-m4-dispatch.md` for the delivered M4 behavior and verification.
