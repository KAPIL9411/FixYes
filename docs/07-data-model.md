# 07 — Data Model Overview

Core entities:
- users, external_identities, user_roles, sessions
- customer_profiles, addresses
- partner_profiles, partner_skills, partner_service_zones, partner_availability
- service_cities, service_zones, service_categories, service_items
- bookings, booking_events, booking_quotes, booking_quote_items
- dispatch_offers, dispatch_attempts
- media_assets, push_tokens
- idempotency_keys, outbox_events, notification_deliveries
- admin_audit_logs

Use UUID primary keys, UTC timestamps, explicit status enums, indexes for lookup/filter paths, and foreign keys. Use decimal/numeric types for money; never floating-point. Store currency explicitly (INR). Store only necessary personal data. Exact address should be protected and not copied into realtime payloads.
