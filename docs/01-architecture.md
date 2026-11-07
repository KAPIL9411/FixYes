# 01 — System Architecture

## High-level components
1. Expo mobile application: one binary, two role-based experiences.
2. Admin web dashboard: separate origin, strict admin authentication and RBAC.
3. Cloudflare Worker API: authentication, authorization, validation, domain logic.
4. Neon PostgreSQL: authoritative persistent state.
5. Drizzle ORM: typed schema and queries.
6. Cloudinary: signed media uploads and delivery.
7. Durable Object booking room: WebSocket fan-out for authorized booking participants.
8. Expo Push: background/device notifications; best-effort only.

## Data flow
Mobile/Admin -> HTTPS API -> authentication + role/ownership checks -> domain service -> PostgreSQL transaction -> append booking event -> publish realtime event -> push notification job.

The database is the source of truth. WebSocket messages are notifications of committed changes, not the state itself. Clients must refetch canonical booking state after reconnecting.

## Why a Durable Object
A per-booking room provides ordered, low-latency fan-out for participants. It must not own authoritative booking or payment state. Persist the event first, then publish. If fan-out fails, clients recover through event cursor/refetch.

## Database connectivity
Use Neon serverless HTTP driver for short request/transaction workloads. For multi-step transactional flows, use a supported transactional connection strategy and test it in Workers. Never assume separate HTTP statements are atomic. Dispatch reservation and assignment must be committed atomically.

## Scalability principles
- Stateless API instances.
- Indexed queries and pagination.
- No N+1 query patterns.
- Bounded payload sizes and request timeouts.
- Idempotency keys for booking creation and dispatch actions.
- Outbox table for reliable asynchronous work.
- Per-user/per-IP rate limits.
- Queue-based work for push delivery, retries and noncritical tasks.
- Avoid synchronous third-party calls in the critical booking transaction.

## Performance targets (targets, not guarantees)
- API p95 under 300 ms for simple reads in a warm, nearby region under expected pilot load.
- API p95 under 700 ms for normal booking writes, excluding third-party/provider latency.
- Dispatch first offer target under 5 seconds when eligible partners are online.
- Realtime event delivery target under 1 second in normal network conditions.
- Monitor p50/p95/p99, error rate, DB latency, dispatch time and notification outcomes.

These targets must be validated with realistic load tests and may need revision based on geography, Neon region, Worker placement and quotas.
