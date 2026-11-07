# Domain modules to implement

Create separate modules for:
- auth/session
- users/roles
- partners/onboarding/skills
- catalogue/cities/zones
- pricing/quotes
- bookings/state-machine
- dispatch/eligibility/ranking/offers
- realtime/events/booking-room
- media/cloudinary
- notifications/expo
- admin/audit

Each module must have: Zod schemas, service layer, repository layer, route handlers, authorization tests and domain tests. Keep route handlers thin. Do not put business logic in UI or route files.
