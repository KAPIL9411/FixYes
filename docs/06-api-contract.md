# 06 — API Contract (proposed)

Prefix: `/v1`

## Public / authenticated
- `GET /health`
- `GET /ready`
- `GET /me`
- `PATCH /me`
- `GET /service-cities`
- `GET /service-categories`
- `GET /service-items?categoryId=...`
- `GET /service-zones?cityId=...`
- `POST /media/signature`
- `POST /media/confirm`
- `GET /addresses`
- `POST /addresses`
- `PATCH /addresses/:addressId`
- `DELETE /addresses/:addressId`
- `POST /bookings` (idempotency key required)
- `GET /bookings/:bookingId`
- `GET /bookings/:bookingId/events?afterSequence=...`
- `POST /bookings/:bookingId/cancel`
- `POST /bookings/:bookingId/complete`
- `POST /bookings/:bookingId/quotes`
- `POST /bookings/:bookingId/quotes/:quoteId/respond`
- `POST /partner/onboarding`
- `GET /partner/profile`
- `GET|PATCH /partner/availability`
- `GET|PUT /partner/service-zones`
- `GET /partner/offers`
- `POST /partner/offers/:offerId/accept`
- `POST /partner/offers/:offerId/reject`
- `POST /partner/bookings/:bookingId/status`
- `POST /push-tokens`

## Admin (admin role only)
- `GET /admin/partners`
- `GET /admin/partners/:partnerId`
- `POST /admin/partners/:partnerId/approve`
- `POST /admin/partners/:partnerId/suspend`
- `POST /admin/bookings/:bookingId/assign`
- `POST /admin/bookings/:bookingId/reassign`
- `PATCH /admin/service-cities/:cityId`
- `POST /admin/service-zones`
- `GET /admin/service-categories`
- `POST /admin/service-categories`
- `POST /admin/service-items`
- `GET /admin/audit-logs`

## Contract rules
- Use cursor pagination for lists.
- Return stable error codes and request IDs.
- Validate all inputs with Zod.
- Use `If-Match`/version or explicit idempotency for mutable resources.
- Never expose internal stack traces.
- API contract is proposed and must be versioned before client implementation.

## M3 implemented notes
- `POST /bookings` requires `Idempotency-Key` (8–128 letters, numbers, dashes or underscores). Replay returns `200` with `Idempotent-Replay: true`; the same key with a different request returns `409 IDEMPOTENCY_CONFLICT`.
- The server prices a booking from the enabled service item’s `basePrice`. Client-supplied price fields are rejected by the strict request schema.
- Address reads and writes are scoped to the authenticated user; an address referenced by a booking cannot be deleted.
- Booking reads and events are limited to the customer owner, assigned partner and admins.
- Booking transitions accept optional `expectedVersion`. A stale version returns `409 BOOKING_VERSION_CONFLICT`; an illegal transition returns `409 INVALID_TRANSITION`.
- Customer cancellation is allowed through `IN_PROGRESS`. Customer completion is only `COMPLETION_PENDING -> COMPLETED`. Partner status commands are limited to the assigned partner’s valid chain and require a reason for partner cancellation.
- Dispatch, auto-completion, admin booking commands, quotes, realtime and push were not implemented in M3; see the M4 notes below for dispatch and admin assignment.

## M4 implemented notes
- `POST /bookings` now runs auto-dispatch after the booking and idempotency record commit. The response can be `DISPATCHING` with one expiring offer, or `NO_PARTNER_AVAILABLE` when no candidate exists.
- Automatic dispatch considers only approved, non-disabled, verified-skill partners with an enabled service city and zone, who are online and below the active-job limit. Admin assignment uses the same checks but allows an offline partner.
- Offers expire after two minutes by default. The Worker cron expires due offers every minute; accept and reject also check expiry synchronously and return `409 OFFER_EXPIRED`.
- Only one `PENDING` offer may exist per booking. A partner may accept only their own pending unexpired offer. Duplicate accepts by the same partner are idempotent; a different partner receives `403`; an accept after admin assignment receives `409 OFFER_NOT_PENDING`.
- Rejecting or missing an offer advances to the next candidate within the configured attempt budget. Exhaustion returns the booking to `NO_PARTNER_AVAILABLE`.
- `PATCH /partner/availability` requires the `PARTNER` role and accepts `isOnline` plus optional latitude/longitude supplied together. Suspended partners are refused.
- `PUT /partner/service-zones` replaces memberships and refuses zones that are disabled or outside the partner’s service city.
- `POST /admin/bookings/:bookingId/assign` accepts `REQUESTED`, `DISPATCHING` or `NO_PARTNER_AVAILABLE`. `POST /admin/bookings/:bookingId/reassign` accepts `PARTNER_ASSIGNED`, `PARTNER_ACCEPTED`, `ON_THE_WAY` or `ARRIVED`. Both require `partnerId` and a reason, optionally accept `expectedVersion`, cancel pending offers, update workload, append a booking event and write an admin audit row.
- Admin assignment does not require the partner to be online, but it does not bypass approval, verified skill, service city/zone or workload capacity checks.
- Offer commands rely on offer state for idempotency; they do not require a separate `Idempotency-Key` header.
