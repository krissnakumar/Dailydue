# Native integrations (Supabase + Google + Facebook + Play Billing)

This app already includes working end-to-end scaffolding for:

- **Google Sign-In (native on Android + OAuth fallback)**: `apps/mobile/app/(auth)/login.tsx`
- **Facebook Login (OAuth via browser)**: `apps/mobile/app/(auth)/login.tsx`
- **Google Play Billing (subscriptions)**: `apps/mobile/app/(tabs)/subscription.tsx`

## Environment variables

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: Google OAuth **Web client ID** (required for Android native Google Sign-In → Supabase `signInWithIdToken`)
- `EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID`: Play Console **subscription product id** (shown on the Subscription screen)
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`: iOS reversed client scheme, e.g. `com.googleusercontent.apps.123...` (required by the config plugin; see `apps/mobile/app.config.js`)

## Build notes (Expo dev client)

Both Google native sign-in and Play Billing require **native modules**, so they won’t work in **Expo Go**:

- Rebuild the dev client after adding/updating native deps: `npx expo prebuild` then `npx expo run:android`

## Google Play Billing notes

- The app uses `react-native-iap` and purchases subscriptions via `requestPurchase({ type: 'subs', ... })`.
- Purchases are currently treated as an **immediate local unlock** after `finishTransaction`. For production-grade entitlements, implement **server-side verification** and make Supabase return the paid plan from `get_current_plan`.

## Supabase provider setup

Enable the providers in Supabase Auth:

- Google: configure the Web Client ID in Supabase and make sure Android SHA fingerprints are registered in Google Cloud.
- Facebook: configure App ID/Secret in Supabase and add the Supabase callback URL in Meta “Valid OAuth Redirect URIs”.

