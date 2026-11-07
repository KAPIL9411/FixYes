# Fixyes Backend

Backend for the Fixyes local home-services marketplace. One Expo app serves customers and service partners; the admin dashboard is a separate origin. This repository covers the Cloudflare Workers API only.

This is an implementation in progress, not a production-certified service. "Unhackable", "zero latency" and "no downtime" are not claims made here.

## Stack

- Cloudflare Workers + Hono + TypeScript
- Neon PostgreSQL + Drizzle ORM (HTTP for one-shot queries, per-request WebSocket pool for interactive transactions)
- Google ID-token sign-in with multiple audiences and single-use nonces
- Opaque, revocable session tokens (hash stored, raw token returned once)
- Durable Object booking rooms and Expo Push (later milestones)
- Zod validation, Vitest, ESLint, GitHub Actions CI

No payment gateway, wallet, escrow, payout, Aadhaar collection, R2, Firebase Auth or phone OTP is part of this foundation.

## Start here

1. Read `docs/00-product-decisions.md`.
2. Read `docs/01-architecture.md` through `docs/05-realtime-and-notifications.md`.
3. Read `docs/09-m0-architecture-review.md` for the approved decision log (D1–D16), then `docs/12-m3-bookings.md` and `docs/13-m4-dispatch.md` for delivered behavior.
4. Copy `.env.example` to `.dev.vars` and fill in local values. Never commit `.dev.vars`.
5. Run `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, then `npm run dev`.

`npm run dev` starts `wrangler dev` on the local Worker. Without `DATABASE_URL` and `GOOGLE_CLIENT_IDS`, health routes work but authentication returns 503.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string. Use a development branch, never production. |
| `GOOGLE_CLIENT_IDS` | Comma-separated Google OAuth client IDs (web, iOS, Android). No client secret is needed for ID-token login. |
| `APP_ORIGINS` | Comma-separated CORS allowlist for the admin dashboard and web clients. |
| `ENVIRONMENT` | `development`, `staging` or `production`. |
| `CLOUDINARY_*` | Signed-upload credentials used in M2. |
| `EXPO_ACCESS_TOKEN` | Optional Expo push access token used in M5. |

Secrets belong in `.dev.vars` locally and `wrangler secret put` / the Cloudflare dashboard in deployed environments. `APP_ORIGINS`, `ENVIRONMENT` and `GOOGLE_CLIENT_IDS` are non-secret Worker vars in `wrangler.jsonc`.

## Authentication flow

1. `POST /v1/auth/nonce` issues a single-use challenge valid for 10 minutes.
2. The Expo app passes that nonce to Google Sign-In and sends the resulting ID token plus nonce to `POST /v1/auth/google`.
3. The Worker verifies the RS256 signature against Google JWKS, checks `iss`, `aud` against the configured client IDs, `azp`, `exp` and the nonce, then consumes the nonce.
4. The Worker returns an opaque bearer token. Only its SHA-256 hash is stored in `sessions`; the token has a 7-day idle and 30-day absolute lifetime.
5. `POST /v1/auth/refresh` rotates the token and revokes the previous one. `POST /v1/auth/logout` revokes the current session.
6. `GET /v1/me` is protected by `Authorization: Bearer <token>`.

Roles are always read from `user_roles` in the database. New Google users receive `CUSTOMER`; `PARTNER` is granted through onboarding and `ADMIN` only through the operator bootstrap procedure. Clients never supply roles.

## Database

The schema lives in `src/db/schema.ts`. Migrations are generated into `database/migrations` and must be reviewed before applying.

```bash
npm run db:generate    # generate a migration from the schema
npm run db:check       # check migration consistency
npm run db:migrate     # apply pending migrations to DATABASE_URL
npm run db:rollback    # apply the matching down migration with psql
```

The initial down migration is `database/rollback/0000_initial_schema.down.sql`. Test migrations on a scratch Neon branch before any shared environment. No migration has been applied by this repository yet.

## API surface in M4

Public catalogue reads:

- `GET /v1/service-cities`
- `GET /v1/service-zones?cityId=<uuid>`
- `GET /v1/service-categories`
- `GET /v1/service-items?categoryId=<uuid>`

Authenticated address, booking, partner and media routes:

- `GET|POST /v1/addresses`
- `PATCH|DELETE /v1/addresses/:addressId`
- `POST /v1/bookings` (`Idempotency-Key` required, customer only)
- `GET /v1/bookings/:bookingId`
- `GET /v1/bookings/:bookingId/events?afterSequence=<n>`
- `POST /v1/bookings/:bookingId/cancel`
- `POST /v1/bookings/:bookingId/complete`
- `POST /v1/partner/bookings/:bookingId/status`
- `POST /v1/partner/onboarding`
- `GET /v1/partner/profile`
- `GET|PATCH /v1/partner/availability`
- `GET|PUT /v1/partner/service-zones`
- `GET /v1/partner/offers`
- `POST /v1/partner/offers/:offerId/accept`
- `POST /v1/partner/offers/:offerId/reject`
- `POST /v1/media/signature`
- `POST /v1/media/confirm`

Booking prices are read from the enabled service item on the server; clients cannot submit a price. Booking creation and transitions are server commands with append-only `booking_events` and optimistic `expectedVersion` checks. Customer cancellation is allowed through `IN_PROGRESS`; completion is `COMPLETION_PENDING -> COMPLETED` by the customer. Booking creation automatically dispatches to one ranked online partner and creates a two-minute offer. Reject, expiry and retry advance to the next candidate; exhaustion moves the booking to `NO_PARTNER_AVAILABLE`. Auto-completion, quotes, realtime and push remain later milestones.

Admin routes (`ADMIN` role required, no public admin path):

- `PATCH /v1/admin/service-cities/:cityId`
- `POST /v1/admin/service-zones`
- `GET|POST /v1/admin/service-categories`
- `POST /v1/admin/service-items`
- `GET /v1/admin/partners` and `GET /v1/admin/partners/:partnerId`
- `POST /v1/admin/partners/:partnerId/approve`
- `POST /v1/admin/partners/:partnerId/suspend`
- `POST /v1/admin/bookings/:bookingId/assign`
- `POST /v1/admin/bookings/:bookingId/reassign`
- `GET /v1/admin/audit-logs`

Auth, health and `/v1/me` routes are described above. Admin assignment/reassignment writes an audit row and a booking event; an optional `expectedVersion` rejects stale commands. Quote, realtime and push routes remain absent until their milestones and authorization tests exist.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

CI runs the same checks. It does not deploy and does not need Cloudflare or Neon credentials.

## Current limits

- No integration test has run against a real Neon database; repository code is exercised through an in-memory contract implementation. The up migration has not been executed by this repository.
- Cloudinary signing is tested locally, but no real Cloudinary upload or Admin API call has been made.
- There is no admin bootstrap command yet, so granting `ADMIN` remains an operator database procedure until M6.
- Dispatch expiry is driven by a one-minute Worker cron and service-level expiry checks; no queue/outbox exists, and cron behavior has not been observed on Cloudflare.
- Zone dispatch checks enabled membership, not polygon containment; availability windows, routing time and push delivery are not implemented.
- Automatic completion, quotes, realtime rooms and push notifications are not implemented yet.
- The Durable Object room is still a 501 placeholder.
- No load test, penetration test, backup/restore drill, or legal review has been performed.
- Cloudflare, Neon, Cloudinary and Expo quotas are not production SLAs.
