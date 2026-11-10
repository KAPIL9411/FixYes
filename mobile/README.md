# Fixyes Mobile

Native iOS and Android app for Fixyes, built with Expo (SDK 58), React Native, Expo Router and TypeScript. One app serves customers and service partners.

## Quick Start

```bash
cd mobile
npm ci
npm start
```

Scan the QR code with Expo Go. The app connects to the API configured in `.env`.

## Environment

Copy `mobile/.env.example` to `mobile/.env` and fill in values:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=optional-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=optional-android-client-id.apps.googleusercontent.com
EXPO_PUBLIC_SUPPORT_EMAIL=support@example.com
```

- **Live mode**: Set `EXPO_PUBLIC_API_BASE_URL` to a running API base URL and provide a Google client ID.
- **No demo mode**: The app has no on-device demo. It will fail closed with a configuration screen if the API base URL is missing or API returns errors.
- Google sign-in uses `expo-auth-session` with a backend nonce and exchanges the Google ID token at `POST /v1/auth/google`. Tokens are kept in `expo-secure-store`.

## Builds

`eas.json` contains development, preview and production profiles. Native builds require an Expo account:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile production
```

`app.json` already sets the Android package and iOS bundle ID. Store submission, signing keys and store listings are not configured in this workspace.

## Checks

```bash
npm run lint
npm run typecheck
npx expo-doctor
```

## Design System

The interface uses the Fixyes consumer-tech token set: `#2457E6` primary blue, `#F8F9FC` canvas, white surfaces, dark ink, green success and amber attention states. Blue is reserved for primary actions, live state and current navigation rather than applied to every surface.

Sofia Sans is the default typeface for all UI, forms, navigation and dense information. Tokens live in `src/theme.ts`; shared primitives are in `src/ui/`, with `CategoryCard`, `StatusBadge`, `JobCard`, `BookingCard` and `Brand` composed from them.

"Avantt" is a commercial typeface from Displaay. Its downloadable TRIAL release is licensed for personal use only, so it is not embedded in this repository or shipped in the app. The display tokens currently use Schibsted Grotesk as a licensed fallback. To switch to Avantt after obtaining a commercial licence, add the licensed font files under `assets/fonts/`, register them in `src/app/_layout.tsx`, and change only `fonts.display` / `fonts.displayHeavy` in `src/theme.ts`.

## Screen Inventory

Customer: welcome, home, search, category, service detail, three-step booking, booking list, booking tracking, completion confirmation, addresses, profile, help and settings.

Partner: join landing, application, approved workspace, dashboard with offline/online/busy states, requests, active/completed jobs, job detail with directions, earnings, service zones, work history, profile and settings.

There is no backend endpoint for coupons, customer reviews, provider payouts or customer phone numbers. Those surfaces are intentionally not fabricated; the app shows real loading, empty and error states for the data that does exist.

## Structure

```
src/app/            Expo Router routes
  (tabs)/           Home, Bookings, Partner, Profile
  service/          Service detail
  book/             Booking flow
  bookings/         Booking tracking
  partner/          Partner application, zones, job, history
src/api/            Typed API boundary: live HTTP client
src/ui/             Design system and shared components
src/hooks/          React Query data hooks
src/data/           Catalogue content and service metadata
src/assets.ts       Local category visuals
```

## Current Limitations

- No payment gateway, wallet, payout or escrow. Customers pay the partner after the service; "job value" is not a payout statement.
- Tracking uses polling (5–8 seconds), not the Worker's realtime WebSocket ticket.
- There is no provider marketplace: dispatch assigns a verified partner, so the app does not show browsable partner profiles or invented ratings.
- Partner approval is handled by the backend/admin side; the backend is live-only.
- Push notifications are not wired. The bell explains that booking updates appear in the app.
- Coupons, customer reviews and provider payouts have no backend model or endpoint, so no mock offers, ratings or payout balances are shown.
- The Avantt TRIAL font is deliberately not bundled because its licence does not allow commercial embedding. See the design-system section for the one-file swap after purchasing a licence.
- The live path has not been fully exercised in this workspace because no Google client, Neon database or deployed Worker credentials were provided.
- The supplied white `.webp` logo still needs to be placed to replace the text wordmark in the app.