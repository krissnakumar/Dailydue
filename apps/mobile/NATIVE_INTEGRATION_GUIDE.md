# Native integrations (Supabase + Google + Facebook + Play Billing)

This app includes working end-to-end scaffolding for:

- **Google Sign-In (native on Android + OAuth fallback)**: `apps/mobile/app/(auth)/login.tsx`
- **Facebook Login (OAuth via browser)**: `apps/mobile/app/(auth)/login.tsx`
- **Google Play Billing (subscriptions)**: `apps/mobile/app/(tabs)/subscription.tsx`

---

## Resolving Localhost Redirect Errors for Social Logins (Google & Facebook)

When running the app on a physical device inside **Expo Go** or a **Development Client**, using Facebook or Google OAuth requires the redirect handshake to route back to your physical device. If the URL routes to `localhost`, it will fail because your device cannot resolve your computer's `localhost` loop.

### 1. Auto-detected LAN IP (Best for local Expo Go testing)
The app now automatically extracts your computer's local LAN IP from the active Expo package server (using `Constants.expoConfig.hostUri`). For example:
- Generating redirect URI: `exp://192.168.1.50:8081/--/auth/callback` (instead of `exp://localhost...`).

### 2. Manual Environment Override
If you want to manually bind a specific IP or reverse-proxy domain (e.g. `ngrok`), you can set:
- `EXPO_PUBLIC_DEV_SERVER_IP=192.168.1.50` (or your Ngrok tunnel domain)

### 3. Production Native Scheme (Development Client & Standard Builds)
When built into a native standalone package (using `npx expo prebuild` or EAS), the redirect URL uses the permanent deep-link scheme:
- `dailydue://auth/callback`

---

## Social Auth Provider Configurations (Supabase + Cloud Consoles)

To make OAuth work successfully, register these redirect URIs inside your respective consoles:

### 1. Supabase Console Setup
Go to **Supabase Dashboard $\rightarrow$ Auth $\rightarrow$ URL Configuration**:
- **Site URL**: `https://your-production-web-app.com` (or a placeholder)
- **Redirect URLs (Allow List)**: Add both the development and production deep links:
  - `dailydue://auth/callback` (Production standalone builds)
  - `exp://<your-computer-lan-ip>:8081/--/auth/callback` (Required only if testing OAuth inside **Expo Go** via LAN)

### 2. Facebook (Meta Developer Portal) Setup
Go to **Meta Developer Portal $\rightarrow$ [Your App] $\rightarrow$ Use Cases $\rightarrow$ Authentication (Facebook Login) $\rightarrow$ Settings**:
- **Valid OAuth Redirect URIs**: Enter your Supabase project's auth callback URL:
  - `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
  *Note: You do NOT add `localhost` or `dailydue://` to the Facebook console; all browser requests route through Supabase.*

### 3. Google Cloud Console Setup
Go to **Google Cloud Console $\rightarrow$ APIs & Services $\rightarrow$ Credentials**:
- Create an **OAuth 2.0 Web Application Client ID**.
- **Authorized redirect URIs**: Enter your Supabase project's auth callback URL:
  - `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
- Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in your `.env` to this Web Client ID.

---

## Environment Variables Configuration

Create a `.env` file in the root of `apps/mobile/` and define the following variables:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google OAuth Setup
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your-id

# Google Play Billing Setup
EXPO_PUBLIC_GOOGLE_PLAY_PREMIUM_SUB_ID=your_subscription_product_id

# Optional: Manual LAN IP override if auto-detect is bypassed
# EXPO_PUBLIC_DEV_SERVER_IP=192.168.1.50
```

---

## Build Notes (Expo Dev Client)

Both native Google sign-in and Google Play Billing utilize **native custom modules**, which means they will not function in the pre-compiled standard **Expo Go** client from the Play Store/App Store. 

To run and test these native features:
1. Rebuild the local development client:
   ```bash
   npx expo prebuild
   npx expo run:android
   ```
2. Start the dev server in LAN mode to allow connections from physical devices:
   ```bash
   npm run dev
   ```
