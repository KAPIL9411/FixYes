# 03 — Booking State Machine

## Booking lifecycle
`REQUESTED -> DISPATCHING -> PARTNER_ASSIGNED -> PARTNER_ACCEPTED -> ON_THE_WAY -> ARRIVED -> IN_PROGRESS -> COMPLETION_PENDING -> COMPLETED`

Possible alternate terminal/intermediate states:
- `CANCELLED_BY_CUSTOMER`
- `CANCELLED_BY_PARTNER`
- `CANCELLED_BY_ADMIN`
- `NO_PARTNER_AVAILABLE`
- `DISPUTED`

## Rules
- Every transition is a server-side command with actor, timestamp and reason.
- Store an append-only `booking_events` record for every transition.
- Validate allowed previous state and actor permission.
- Use optimistic version checks or row-level locking to prevent race conditions.
- Idempotency key required for retryable state-changing requests.
- Client cannot directly PATCH a status field.
- Completion is confirmed by the customer; the 24-hour auto-completion timeout is deferred.
- Cancellation fee/refund rules are not assumed and must be configured after legal/payment review.

## M3 implementation notes
- The role-aware matrix is in `src/domain/booking-state.ts`; routes and services are in `src/routes/bookings.ts`, `src/routes/partner-bookings.ts` and `src/platform/booking-services.ts`.
- Booking creation writes event sequence `1`; each successful transition increments `bookings.version` and writes an event with `sequence = version` in the same transaction.
- The customer may cancel through `IN_PROGRESS`, but not from `COMPLETION_PENDING`.
- The assigned partner may cancel through `ARRIVED` and must provide a reason.
- The customer confirms `COMPLETION_PENDING -> COMPLETED`. The 24-hour auto-completion job is deferred.
- Admin and system transitions are present in the matrix; M3 exposed no admin booking route.
- M3 still left dispatch (`REQUESTED -> DISPATCHING`, assignment and offers) to M4.

## M4 implementation notes
- Booking creation starts dispatch: `REQUESTED -> DISPATCHING` writes `DISPATCH_STARTED` with a null actor because it is a system command.
- A partner accepting their pending offer moves `DISPATCHING -> PARTNER_ASSIGNED` and increments the partner’s active workload in the same transaction.
- Reject or offer expiry leaves the booking in `DISPATCHING` while the next candidate is tried. Exhausting the retry budget moves `DISPATCHING -> NO_PARTNER_AVAILABLE`.
- An admin may assign from `REQUESTED`, `DISPATCHING` or `NO_PARTNER_AVAILABLE`. Assignment from `REQUESTED` first records `DISPATCH_STARTED`; assignment from `DISPATCHING` cancels pending offers.
- An admin may reassign from `PARTNER_ASSIGNED`, `PARTNER_ACCEPTED`, `ON_THE_WAY` or `ARRIVED`. Reassignment resets the booking to `PARTNER_ASSIGNED`, reverses the previous partner’s workload, increments the new partner’s workload and writes `BOOKING_REASSIGNED` with the reason and both partner IDs.
- Terminal transitions decrement the assigned partner’s `active_job_count` and cancel any pending dispatch offer in the same transaction as the booking update.
- Dispatch and admin assignment are implemented in `src/platform/dispatch-services.ts`, `src/routes/partner-dispatch.ts` and `src/routes/admin.ts`. Offer expiry is also driven by the Worker cron in `src/index.ts`.

## Additional work / quote
1. Partner submits line items, reason, amount and evidence.
2. Backend calculates/validates amount using configured rules.
3. Customer receives a quote version and expiry.
4. Customer explicitly accepts or rejects.
5. Work requiring additional charge cannot proceed before acceptance.
6. Record quote snapshot and actor/time; never overwrite prior accepted quote.

## Separate state domains
Booking status, payment status and partner payout status are separate state machines. V1 foundation does not execute payments or payouts.
