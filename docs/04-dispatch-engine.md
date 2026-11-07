# 04 — Automatic Dispatch Engine

## Candidate eligibility (hard filters)
- Partner account approved and active.
- Required skill/category verified.
- Partner service zone covers booking location.
- Partner opted in/online and availability window valid.
- Partner not suspended or blocked.
- Workload below configured concurrent-job limit.
- Partner has not declined this booking or exceeded configured offer policy.

## Ranking (soft score)
Rank only eligible partners using configurable weighted factors:
- Estimated travel time/distance (not straight-line distance alone where routing data exists).
- Skill/category match and service quality.
- Current workload and schedule.
- Recent acceptance/completion reliability.
- Fairness: avoid repeatedly starving new or lower-volume partners.

Do not use protected characteristics or proxies for them. Explain ranking factors internally and audit for unfair outcomes.

## Offer loop
1. Create booking and idempotency record.
2. Lock booking row / reserve dispatch attempt transactionally.
3. Query eligible partners using indexed zone/skill/availability data.
4. Rank candidates.
5. Create one expiring offer for the top candidate.
6. Notify partner; push is best-effort, in-app offer is canonical.
7. Partner accepts/rejects before deadline.
8. Accept command transactionally verifies offer still active and booking unassigned.
9. On reject/timeout, expire offer and try next candidate.
10. After retry budget, set `NO_PARTNER_AVAILABLE`, notify customer and alert admin.

## Concurrency and failure handling
- Only one active offer per booking in V1.
- Unique/partial index should enforce one active offer.
- Accept operation must use atomic conditional update/transaction.
- Duplicate accepts return stable result, never double-assign.
- Idempotency keys for offer/accept/reject actions.
- Dispatch worker must be retry-safe.
- Use durable queue/outbox for retries; never rely only on an in-memory timer.
- Admin can manually assign/reassign with reason and audit event.
- Admin override must not bypass partner verification or skill eligibility unless a separately audited emergency policy is designed.

## Configuration
Offer timeout, max attempts, max workload, service radius, ranking weights and quiet-hour policy must be configurable. Do not hard-code these values in frontend.

## M4 implementation notes
- Implemented in `src/domain/dispatch.ts` and `src/platform/dispatch-services.ts`; partner routes are in `src/routes/partner-dispatch.ts`, admin assignment in `src/routes/admin.ts`, and cron expiry in `src/index.ts`.
- Hard filters use approved/non-disabled partners, verified category skill, enabled city and zone membership, online state for automatic dispatch, and workload below the configured limit. Admin assignment allows offline partners but keeps the other checks.
- Ranking is a deterministic baseline of workload (`activeJobCount * 10`) plus Haversine distance, with a neutral 25 km when coordinates are missing. Routing time, quality, reliability and fairness weighting are not implemented.
- One `PENDING` offer per booking is enforced by a partial unique index. Offer TTL is two minutes, attempts default to three and concurrent jobs to five; the service accepts overrides.
- Expiry runs from a one-minute Worker cron and is also checked synchronously on accept/reject. No queue or outbox was added. Cancelling a booking from `DISPATCHING` cancels its pending offer in the same transition.
- Push notification, availability windows, polygon containment and customer/admin alerts remain deferred.
