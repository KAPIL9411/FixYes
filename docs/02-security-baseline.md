# 02 — Security Baseline

Security is defense-in-depth, not a claim that the app is unhackable.

## Authentication
- Accept Google ID tokens only over HTTPS.
- Verify signature using Google's published JWKS; validate issuer, audience, expiry, issued-at and nonce where applicable.
- Do not accept an email address or decoded JWT payload without signature verification.
- Use Google `sub` as stable external identity key; email is mutable.
- Never put Google client secrets in mobile/web bundles.
- Use short-lived application access tokens and rotating refresh-token sessions if session tokens are introduced. Store refresh-token hashes, not raw tokens.
- Revoke sessions on logout, account disablement and suspected compromise.

## Authorization
- Deny by default.
- Enforce role + resource ownership on every protected endpoint.
- Partner can access only assigned/offered jobs and their own profile/earnings.
- Customer can access only their own addresses/bookings.
- Admin routes require explicit admin role and stronger session controls.
- Never rely on hidden UI controls for authorization.
- Audit all admin actions and sensitive partner verification decisions.

## API protection
- Zod validation for params, query and body.
- Strict CORS allowlist; do not use wildcard origins with credentials.
- Rate limit login, booking creation, quote approvals, dispatch actions and upload-signature requests.
- Request body and upload size limits.
- Security headers where applicable.
- Parameterized SQL/ORM queries only.
- Idempotency keys on booking creation and state-changing actions.
- Generic client errors; no stack traces or secrets in responses.
- Structured logs with request ID; redact tokens, email where possible, addresses, documents and sensitive payloads.

## Media
- Browser/mobile receives only time-limited signed Cloudinary upload parameters from backend.
- Restrict allowed formats, MIME types, file size, resource type and upload folder.
- Verify upload result/signature server-side before attaching media to a record.
- Keep private identity documents in restricted access paths; use authenticated delivery or short-lived signed URLs.
- Do not store Aadhaar by default. Collect only legally necessary information and obtain explicit notice/consent.

## Database and secrets
- Least-privilege database role.
- Separate dev/staging/production databases and credentials.
- Rotate secrets; use Cloudflare secrets, not committed `.env`.
- Backups and restore drills are mandatory before production.
- Apply migrations through controlled release process.
- Do not expose database URL or Cloudinary API secret to clients.

## Business invariants
- Backend computes all prices.
- Partner cannot alter quoted amount.
- Additional work requires explicit customer approval with immutable quote/version.
- Booking status transitions are validated server-side.
- Payment, booking and payout states are separate.
- Never mark paid based only on a client callback; verify gateway webhooks when a gateway is later selected.
- Dispatch assignment must be atomic and idempotent.

## Launch gates
- Threat model and abuse-case review.
- Dependency and secret scan.
- Unit, integration and authorization tests.
- Load test and database query review.
- External penetration test for public launch.
- Incident response and account recovery procedures.
