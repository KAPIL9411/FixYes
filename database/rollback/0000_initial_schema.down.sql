-- Rollback for database/migrations/0000_initial_schema.sql.
-- Use only on a scratch or explicitly approved environment. This drops all application data.
-- If drizzle-kit has recorded the migration in its journal, remove that journal entry as well.

DROP TABLE IF EXISTS "notification_deliveries" CASCADE;
DROP TABLE IF EXISTS "outbox_events" CASCADE;
DROP TABLE IF EXISTS "idempotency_keys" CASCADE;
DROP TABLE IF EXISTS "admin_audit_logs" CASCADE;
DROP TABLE IF EXISTS "app_config" CASCADE;
DROP TABLE IF EXISTS "push_tokens" CASCADE;
DROP TABLE IF EXISTS "media_assets" CASCADE;
DROP TABLE IF EXISTS "dispatch_attempts" CASCADE;
DROP TABLE IF EXISTS "dispatch_offers" CASCADE;
DROP TABLE IF EXISTS "booking_quote_items" CASCADE;
DROP TABLE IF EXISTS "booking_quotes" CASCADE;
DROP TABLE IF EXISTS "booking_events" CASCADE;
DROP TABLE IF EXISTS "bookings" CASCADE;
DROP TABLE IF EXISTS "partner_availability" CASCADE;
DROP TABLE IF EXISTS "partner_zone_memberships" CASCADE;
DROP TABLE IF EXISTS "partner_skills" CASCADE;
DROP TABLE IF EXISTS "partner_profiles" CASCADE;
DROP TABLE IF EXISTS "addresses" CASCADE;
DROP TABLE IF EXISTS "service_items" CASCADE;
DROP TABLE IF EXISTS "service_categories" CASCADE;
DROP TABLE IF EXISTS "service_zones" CASCADE;
DROP TABLE IF EXISTS "service_cities" CASCADE;
DROP TABLE IF EXISTS "customer_profiles" CASCADE;
DROP TABLE IF EXISTS "auth_nonces" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "user_roles" CASCADE;
DROP TABLE IF EXISTS "external_identities" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

DROP TYPE IF EXISTS "quote_status";
DROP TYPE IF EXISTS "offer_status";
DROP TYPE IF EXISTS "booking_status";
DROP TYPE IF EXISTS "partner_status";
DROP TYPE IF EXISTS "app_role";
