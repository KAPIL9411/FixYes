# 13 — M4 Dispatch, Offers and Assignment

**Status:** M4 implementation complete — awaiting approval to start M5.
**Date:** 2026-11-06
**Approval basis:** The owner approved M4: dispatch candidate selection, partner offers, assignment and reassignment, offer expiry, and authorization/race-condition tests. No deployment, database migration, Neon connection or paid resource was used.

## 1. What was delivered

| Area | Delivered |
|---|---|
| Auto-dispatch | Booking creation runs dispatch after the booking and idempotency record are committed. A `REQUESTED` booking becomes `DISPATCHING`, one attempt is recorded, and one expiring offer is created for the top-ranked candidate. |
| Candidate hard filters | Approved and non-disabled partner, verified skill for the booking category, enabled service city matching the booking city/state, enabled zone membership in that city, online for automatic dispatch, and active workload below the limit. |
| Ranking | Eligible candidates are ranked by workload first (`activeJobCount * 10`) then Haversine distance to the booking address. Missing coordinates use a neutral 25 km instead of inventing a location. Ties break by partner user ID for determinism. |
| One active offer | Only one `PENDING` offer can exist per booking. The database enforces this with a partial unique index; the in-memory contract implementation rejects a second pending offer. |
| Offer commands | An assigned partner can list only their own unexpired pending offers, accept, or reject. Accepting assigns the booking, increments `partner_availability.active_job_count` and appends `PARTNER_ASSIGNED` in one transaction. |
| Expiry | Offers carry a two-minute TTL. Accept and reject check expiry synchronously. A Worker cron trigger every minute expires due offers and advances the booking to the next candidate, or to `NO_PARTNER_AVAILABLE` when retries are exhausted. |
| Retry budget | Defaults: 2-minute offer TTL, 3 attempts, 5 concurrent jobs, 50 candidates. All four values are configurable through `createDispatchService`; no frontend value is trusted. |
| Admin assignment | `POST /v1/admin/bookings/:bookingId/assign` moves `REQUESTED`, `DISPATCHING` or `NO_PARTNER_AVAILABLE` to an assigned partner. It validates approval, verified skill, service city, enabled zone membership and workload capacity; it allows an offline partner. |
| Admin reassignment | `POST /v1/admin/bookings/:bookingId/reassign` accepts `PARTNER_ASSIGNED`, `PARTNER_ACCEPTED`, `ON_THE_WAY` or `ARRIVED`. The previous partner’s workload is decremented and the new partner’s incremented in the assignment transaction. |
| Audit and events | Admin assignment writes a `BOOKING_ASSIGNED` or `BOOKING_REASSIGNED` audit row with the reason and partner IDs, and appends a booking event carrying `adminOverride`, `previousPartnerUserId` and the reason. |
| Availability | Partners can read and update their online flag and coordinates. Onboarding creates the availability row offline with zero active jobs. Suspension forces the partner offline. |
| Service zones | Partners can read and replace their enabled zone memberships, limited to enabled zones in their service city. |
| Tests | 12 new M4 tests cover auto-dispatch, candidate exclusions, no-candidate exhaustion, accept/idempotent accept/foreign accept, reject-and-advance, expiry and retry exhaustion, cancellation of a pending offer, admin assign/reassign audit and stale-version rejection, ineligible assignment, non-admin refusal, accept-versus-admin-assignment race, availability authorization, zone validation and ranking. |

No schema change was required in M4. The dispatch and availability tables, `offer_status` enum and partial unique offer index already existed in the initial schema. The only configuration change is the `* * * * *` cron trigger in `wrangler.jsonc`.

## 2. API added

All routes require `Authorization: Bearer <session>` unless noted.

| Method and path | Actor | Behaviour |
|---|---|---|
| `GET /v1/partner/availability` | `PARTNER` | Returns the caller’s online flag, active job count and last location. |
| `PATCH /v1/partner/availability` | `PARTNER` | Body: `isOnline`, optional `latitude` and `longitude`. Coordinates must be supplied together. Refused for suspended partners. |
| `GET /v1/partner/service-zones` | `PARTNER` | Returns the caller’s zone IDs. |
| `PUT /v1/partner/service-zones` | `PARTNER` | Body: `zoneIds` (maximum 50). Every zone must be enabled and in the partner’s service city. |
| `GET /v1/partner/offers` | `PARTNER` | Returns only the caller’s pending, unexpired offers with booking city, item name, total and schedule. |
| `POST /v1/partner/offers/:offerId/accept` | `PARTNER` | Assigns the booking if the offer is still pending, unexpired, owned by the caller and the partner has capacity. |
| `POST /v1/partner/offers/:offerId/reject` | `PARTNER` | Marks the offer rejected and immediately offers the booking to the next eligible candidate. |
| `POST /v1/admin/bookings/:bookingId/assign` | `ADMIN` | Body: `partnerId`, `reason` (3–500 chars), optional `expectedVersion`. |
| `POST /v1/admin/bookings/:bookingId/reassign` | `ADMIN` | Same body as assign; allowed from the four assigned/active states. |

Stable dispatch errors include `OFFER_NOT_FOUND`, `OFFER_EXPIRED`, `OFFER_NOT_PENDING`, `PARTNER_WORKLOAD_FULL`, `BOOKING_CONFLICT`, `PARTNER_NOT_ELIGIBLE`, `BOOKING_ALREADY_ASSIGNED`, `INVALID_ASSIGNMENT_STATE` and `BOOKING_VERSION_CONFLICT`. Offer ownership failures return `403` and never reveal another partner’s offer.

Accept and reject are naturally idempotent at the offer level: repeating an accept returns the same assignment for the same partner, and repeating a reject advances at most once. No separate `Idempotency-Key` header is required for offer commands.

## 3. Dispatch sequence

1. `POST /v1/bookings` creates the booking at `REQUESTED` and commits it with the idempotency record.
2. Dispatch transitions `REQUESTED -> DISPATCHING` with a `DISPATCH_STARTED` event.
3. The store reads attempts and offers, refuses to create a second active offer, and stops once the attempt budget is exhausted.
4. Candidates are queried with indexed hard filters, ranked, and the best fresh candidate receives a `PENDING` offer with an `expiresAt`.
5. Partners see the offer in `GET /v1/partner/offers`. Push delivery is not implemented; the in-app offer is canonical.
6. Accept uses a transaction with row locks and conditional updates on the offer, booking status/version and availability capacity.
7. Reject or expiry marks the offer terminal and recursively offers the next candidate.
8. If no fresh candidate remains, the booking becomes `NO_PARTNER_AVAILABLE` with a `NO_CANDIDATES` attempt.
9. An admin can assign or reassign later; pending offers are cancelled in the same transaction.

### Concurrency guarantees

- The partial unique index prevents two `PENDING` offers for a booking even if two dispatch invocations race.
- Offer accept locks the offer row and conditionally updates the booking only when it is still `DISPATCHING`, unassigned and at the expected version.
- Workload capacity is incremented with a conditional `activeJobCount < maxActiveJobs` update; a full partner cannot over-accept.
- Admin assignment locks the booking, validates the expected version, cancels pending offers, moves workload and appends the event/audit in one transaction.
- A partner accept after an admin assignment sees the cancelled offer and returns `409 OFFER_NOT_PENDING`; it cannot overwrite the assignment.
- Terminal booking transitions decrement the assigned partner’s workload and cancel any pending offer in the same transaction.

## 4. Verification actually run

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** (exit 0) |
| `npm run lint` | **Pass** (exit 0) |
| `npm test -- --silent` | **Pass** — 79 tests / 9 files, 0 failed |
| `npm run db:check` | **Pass** — Drizzle reports migration consistency |
| `npm audit --omit=dev` | **Pass** — 0 runtime vulnerabilities |
| `npx wrangler deploy --dry-run` | **Pass** — 1464.17 KiB upload / 272.02 KiB gzip; bindings recognized |

### What the tests prove

- Auto-dispatch selects the lower-workload online partner, creates exactly one attempt and one offer, and a repeated `start` does not create a second offer.
- Unapproved, offline and zone-less partners are excluded from candidates.
- A booking with no candidates becomes `NO_PARTNER_AVAILABLE` with a `NO_CANDIDATES` attempt.
- Accepting assigns the partner, increments workload, appends `PARTNER_ASSIGNED` at the next version, returns the same result on duplicate accept, and refuses a different partner.
- Rejecting advances to the next-ranked candidate and the second partner can accept.
- Expiry advances to the next candidate and, after the configured two attempts, transitions to `NO_PARTNER_AVAILABLE`.
- Customer cancellation from `DISPATCHING` cancels the pending offer; a later accept returns `409 OFFER_NOT_PENDING` and does not increment workload.
- Admin assign/reassign updates the partner, workload, audit action and version; stale versions, ineligible partners and non-admin requests are refused.
- An admin assignment cancels the pending offer, so a later partner accept returns `409 OFFER_NOT_PENDING` and cannot steal the booking.
- Availability requires the partner role and invalid zones are rejected.

Tests use the in-memory platform contract implementation. They do not execute Drizzle/Neon SQL, the partial unique index or the cron trigger on Cloudflare.

## 5. Files changed

**Added**

- `src/domain/dispatch.ts` — dispatch config, Haversine distance and deterministic ranking
- `src/platform/dispatch-services.ts` — dispatch, offer, expiry, availability, zone and admin assignment application service
- `src/routes/partner-dispatch.ts` — partner availability, zones and offer routes
- `test/m4-dispatch.test.ts`
- `docs/13-m4-dispatch.md`

**Updated**

- `src/db/schema.ts` — exported `OfferStatus`
- `src/platform/types.ts` — dispatch, availability, offer, attempt and admin assignment types; nullable event actor for system dispatch
- `src/platform/store-contract.ts` — dispatch/availability/zone contract
- `src/platform/store.ts` — Drizzle candidate, offer, attempt, expiry, assignment and availability methods; terminal workload decrement
- `src/routes/bookings.ts` — optional auto-dispatch after booking creation
- `src/routes/admin.ts` — assign/reassign schema and routes
- `src/app.ts` — optional dispatch service wiring and partner dispatch routes
- `src/index.ts` — production dispatch wiring and `scheduled` expiry handler
- `wrangler.jsonc` — one-minute cron trigger
- `test/helpers/in-memory-platform-store.ts` — dispatch/availability/zone contract implementation
- `README.md`, `docs/03-booking-state-machine.md`, `docs/06-api-contract.md` — M4 surface and policy notes

## 6. Deviations and deferred items

| Item | Status |
|---|---|
| Push notification for new offers | Expo Push remains M5. Offers are available through the in-app endpoint. |
| Durable queue/outbox | No Cloudflare Queues binding was added. Expiry uses the Worker cron plus synchronous expiry checks on accept/reject. |
| Offer TTL precision | Cron runs every minute with a two-minute TTL, so an offer can remain `PENDING` in the table for up to about one minute past expiry; accept/reject still refuse it immediately. |
| Zone geometry | Dispatch checks enabled zone membership, not polygon containment of the booking coordinates. |
| Availability windows | Only the online flag is modelled; scheduled availability windows and quiet hours are deferred. |
| Acceptance re-validation | Accept validates ownership, expiry, booking state/version and workload. It does not re-run skill, city or zone filters because the offer was created from an eligible candidate. |
| Ranking inputs | Baseline ranking uses workload and straight-line distance. Acceptance reliability, service quality, routing time and fairness weighting are deferred. |
| Retry after `NO_PARTNER_AVAILABLE` | Admin assignment works from this state. There is no automatic re-dispatch endpoint or UI to restart the retry budget. |
| Notifications to customer/admin | No customer notification or admin alert is sent when a booking exhausts candidates. |
| Offer/accept idempotency keys | Offer commands rely on offer state for idempotency instead of a separate `Idempotency-Key` header. |
| Admin cancellation | Still present only in the transition matrix, without an M4 route. |
| Payments, quotes, realtime and push | Out of scope and not implemented. |

## 7. Limitations and risks

- **No live PostgreSQL execution.** There is no `DATABASE_URL`, and `psql`, `pg_isready` and Docker are unavailable on this machine. Candidate joins, row locks, the partial unique offer index, conditional workload updates and assignment transactions must be exercised on a scratch Neon branch before any shared environment.
- **No deployment.** The Wrangler dry-run proves bundling, cron configuration and bindings, not runtime behaviour against Neon. Cron expiry has only been tested through the service with a test clock.
- **No load or concurrency test against PostgreSQL.** Race safety is designed through row locks, conditional updates and unique indexes, and is covered by in-memory sequential tests, not real parallel database sessions.
- **No push delivery.** A partner must poll or open the app to see an offer; the two-minute TTL may be short for a purely polling client.
- **No routing service.** Distance is straight-line Haversine; travel time, traffic and service radius are not modelled.
- **No fairness or reliability scoring.** New partners are not explicitly boosted and repeat decliners are excluded only for the current booking.
- **No admin bootstrap.** Granting `ADMIN` remains an operator database procedure until M6.
- **No load, penetration, backup/restore or legal review.** Platform quotas are not production SLAs.

## 8. Next approval

M5 would add quote/additional-work handling, realtime booking updates, Expo Push and the remaining notification lifecycle. No M5 code starts without approval.
