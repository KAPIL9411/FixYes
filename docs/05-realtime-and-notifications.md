# 05 — Realtime and Notifications

## Channels
- Foreground app: authorized WebSocket subscription to a booking room through a Durable Object.
- Background/closed app: Expo Push notifications.
- Recovery: REST fetch using last known event sequence/cursor.

## Event contract
Every event includes:
- `eventId`
- `bookingId`
- `sequence`
- `type`
- `occurredAt`
- minimal safe payload
- schema version

Never broadcast full customer addresses, phone numbers, identity documents or private notes to all room members.

## Authorization
- Authenticate WebSocket handshake using a short-lived, scoped token.
- Check that user is customer on booking, assigned/offered partner, or authorized admin.
- Re-check authorization on reconnect; expire socket sessions.
- Do not put long-lived access tokens in URLs.
- Rate-limit message volume and reject client-originated state mutation messages. Clients subscribe; they do not set authoritative state.

## Reliability
- Commit DB transaction and event/outbox record first.
- Fan out after commit.
- At-least-once delivery is acceptable; clients deduplicate by eventId/sequence.
- On reconnect, client fetches events after last sequence or refetches booking snapshot.
- Push delivery is best-effort. Persist notification attempts and retry transient errors.
- Never assume "push sent" means "user saw it".

## Location
Collect precise partner location only when necessary, with explicit notice and permission. Default policy: partner may share location while marked online or on an active job; stop collection when offline/job policy ends. Define retention and access controls before launch.
