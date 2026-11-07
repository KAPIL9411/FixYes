# 00 — Product Decisions

## Confirmed decisions
| Area | Decision |
|---|---|
| Brand | Fixyes (working name; perform trademark/domain checks) |
| Mobile | One Expo app, role-based Customer / Service Partner experiences |
| Admin | Separate web dashboard |
| Login | Google Sign-In only |
| Backend | Cloudflare Workers, Hono, TypeScript |
| Database | Neon PostgreSQL |
| ORM | Drizzle |
| Media | Cloudinary; no R2 |
| Dispatch | Automatic, with admin override |
| Realtime | Durable Object booking rooms + database-backed event history |
| Notifications | Expo Push |
| Initial geography | Bareilly; admin-controlled service zones and city activation |
| Payments | No live gateway/wallet/escrow in foundation; payment integration requires separate compliance/provider decision |

## Role model
- `CUSTOMER`: may manage own profile/addresses and create/manage own bookings.
- `PARTNER`: must complete onboarding and be approved before receiving offers.
- `ADMIN`: privileged dashboard role, granted only through a controlled bootstrap process and never by public self-selection.
- A user may hold both CUSTOMER and PARTNER roles. Role switching changes app experience, not authorization boundaries.
- The backend derives roles from database records. Never trust role, user ID, price, booking status, or partner ID supplied by the client.

## Naming
Use "Service Partner" in customer-facing UI. Internal enum may remain `PARTNER`.
Fixyes is a suggested brand name, not a verified available trademark or domain.

## Operational assumptions requiring owner confirmation before launch
- Service categories and skill verification criteria.
- Service-zone boundaries and travel radius.
- Partner acceptance timeout and dispatch retry policy.
- Customer cancellation/refund policy.
- Worker classification, insurance, consumer protection, GST and data-protection obligations.
- Whether partner location is collected only while online/on an active job or more broadly. Default: collect the minimum necessary, disclose it, and obtain consent.
