# Google Android setup (One Tap + Play Billing)

This app is an Expo + native Android project (`apps/mobile/android` exists). The integrations below are **Android-only**.

## 0) Expo config plugin note (important)

This repo now uses `apps/mobile/app.config.js` (instead of only `app.json`) so we can pass env-based options to native config plugins.

### Extra env var (iOS only)

Even though the app currently uses native Google Sign-In only on **Android**, the `@react-native-google-signin/google-signin` Expo config plugin requires an iOS URL scheme at build time:

- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` = your reversed iOS client ID scheme, e.g. `com.googleusercontent.apps.1234567890-abcdefg`

If you don’t care about iOS yet, you can leave it unset (a placeholder will be used), but set it correctly before shipping iOS.

## 1) Google One Tap / Native Google Sign-In (Supabase)

Code path: `apps/mobile/app/(auth)/login.tsx` uses native Google Sign-In on Android when configured, and sends the `idToken` to Supabase via `signInWithIdToken`.

### Required env var

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = OAuth **Web client ID** (from Google Cloud Console)

Set it in EAS (recommended) and rebuild.

### Google Cloud Console checklist

- Enable Google Identity / OAuth consent screen.
- Create OAuth client:
  - Type: **Web application**
  - Copy the **client ID** to `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- Add your Android SHA-1/ SHA-256 fingerprints to the same Google Cloud project (the signing key matters):
  - Debug keystore (local `expo run:android`)
  - Upload/Release keystore (Play Console / EAS production)

If SHA fingerprints are missing, Android will fail to return an `idToken`.

## 2) Google Play Billing (Subscriptions)

Code path: `apps/mobile/app/(tabs)/subscription.tsx` uses `react-native-iap` to purchase a subscription.

### Native dependency note

`react-native-iap` requires `react-native-nitro-modules` (peer dependency). After installing deps you must **rebuild** the Android app (a previously-built dev client will crash / not find NitroModules).

### Required env var

- `EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID` = Play Console **subscription product id** (e.g. `faido_premium_monthly`)

### Play Console checklist

- Create a **Subscription** product matching `EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID`.
- Create at least **one Base Plan** and **one Offer** (the app selects the first offer token).
- Add license testers (Settings → License testing) for your test Google accounts.
- Use Internal testing / Closed testing track with a signed AAB.

### Note about verification

The app currently unlocks Premium **locally** after a successful purchase and transaction finalization. For production-grade entitlement, you should implement **server-side verification** (Google Play Developer API) and have Supabase return the paid plan in `get_current_plan`.

## 3) Facebook Login (Supabase OAuth)

Code path: `apps/mobile/app/(auth)/login.tsx` uses Supabase `signInWithOAuth({ provider: 'facebook' })` and completes the flow via `expo-web-browser` + `expo-auth-session`.

### Supabase checklist

- Enable Facebook provider in Supabase Auth.
- Copy the Supabase callback URL into Meta → Facebook Login → Valid OAuth Redirect URIs.

### Meta checklist

- Add Android package name: `br.com.controlefiado.app`
- Add Key Hashes for your signing keys (debug + release)
