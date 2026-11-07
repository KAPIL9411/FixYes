# 08 — Test and Release Plan

## Required tests
- Google token: invalid signature, wrong audience, expired token, wrong issuer.
- Role/ownership matrix for every endpoint.
- Partner onboarding and approval gates.
- Booking idempotency and duplicate submit.
- Booking transition allow/deny matrix.
- Quote approval and rejection; stale quote; replay attempts.
- Dispatch: no candidates, timeout, rejection, duplicate accept, simultaneous accept, partner suspension during offer.
- Admin override and audit trail.
- Cloudinary signature validation, MIME/size limits and unauthorized asset access.
- WebSocket authorization, reconnect, duplicate events and revoked access.
- Push retry and invalid token cleanup.
- Rate limits, oversized payloads, malformed JSON and SQL injection attempts.

## Release stages
1. Local development with test Google OAuth project and test Cloudinary account.
2. Staging with separate DB, Worker and Cloudinary folder.
3. Internal test with synthetic users/partners/bookings.
4. Bareilly closed pilot with manually supervised dispatch fallback.
5. Load test and security review.
6. Public launch only after legal, operational, support and incident readiness.

## Observability
Track request rate, error rate, p50/p95/p99 latency, DB latency, dispatch time, offer acceptance, no-partner rate, websocket reconnects, push delivery errors and queue backlog. Alert on abnormal spikes.
