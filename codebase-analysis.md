# Fiado Mobile — Codebase Analysis & Bug Report

**Date:** May 21, 2026
**Scope:** Full analysis of apps/mobile, packages/api, packages/types

---

## 🔴 CRITICAL (potential crash or data loss)

### 1. Sync queue can get permanently stuck when customer creation fails

**File:** `apps/mobile/src/store/index.ts` — `attemptBackgroundSync()`

When `create_customer_secure` RPC fails (e.g., network error, RLS policy, plan limit), the code checks `isTransientNetworkError` and either pauses or moves the item to `failedSyncItems`. However, if the creation fails with a persistent error (e.g., database constraint), the `customerIdMap` is never populated. Any subsequent `update_customer` or `debt`/`payment` items that reference the temporary ID (`cust_xxx`) will be skipped forever because `isTempCustomerId()` returns `true`, but no mapping exists to resolve them. These items accumulate in the queue, retrying on every app launch.

**Recommendation:** When a `create_customer` fails permanently, all dependent queue items should also be moved to `failedSyncItems`.

---

### 2. Google Play purchase ack'd before premium is activated

**File:** `apps/mobile/app/(tabs)/subscription.native.tsx` — `onPurchaseSuccess`

```ts
await finishTransaction({ purchase, isConsumable: false });
setPlayPremiumActive(true);  // ← runs AFTER finishTransaction
```

`finishTransaction` acknowledges the purchase to Google Play, making it non-refundable through standard means. If `setPlayPremiumActive(true)` throws an exception (e.g., React state error), the user has paid but will not receive premium features. The purchase is consumed and cannot be re-processed.

**Recommendation:** Call `setPlayPremiumActive(true)` *before* `finishTransaction`. If activation fails, don't ack the purchase so Google Play can auto-refund.

---

### 3. Login silently hangs when session is null after sign-in

**File:** `apps/mobile/app/(auth)/login.tsx` — `handleAuth()`

```ts
const sess = data.session;
if (sess) {
  setUser({ ... });
  router.replace('/(tabs)/home');
}
// No else branch — if sess is null, nothing happens.
```

If Supabase returns success but no session (e.g., email confirmation is required), the user sees a spinner that never resolves. No error is shown, no feedback given.

**Recommendation:** Add an `else` branch that shows an appropriate message (e.g., "Check your email to confirm your account") and re-enables the form.

---

### 4. App crashes on startup if Supabase env vars are missing

**File:** `packages/api/index.ts`

```ts
if (!supabaseEnvOk) {
  throw new Error('Missing Supabase config...');
}
```

This is a **synchronous throw at module level**. It prevents the app from loading at all — including offline mode, splash screen, or any fallback UI. If a user downloads an APK with misconfigured env vars, the app is completely unusable.

**Recommendation:** Use lazy initialization with a try/catch, or provide a fallback that shows a friendly configuration error screen instead of crashing.

---

### 5. Native splash screen initialization replaced without checking SDK version

**File:** `apps/mobile/android/app/src/main/java/br/com/controlefiado/app/MainActivity.kt`

```kotlin
SplashScreenManager.registerOnActivity(this)
```

The old `setTheme(R.style.AppTheme)` was commented out and replaced with `SplashScreenManager.registerOnActivity`. This assumes the `expo-splashscreen` module is installed and compatible with the current Expo SDK version. If the module version mismatches, the app will crash on launch with `ClassNotFoundException`.

**Recommendation:** Add a try/catch around the call, or keep the old `setTheme` call as fallback.

---

## 🟠 SERIOUS (type safety, runtime exceptions, fragile patterns)

### 6. Heavy use of `as any` (69 occurrences)

The codebase casts `user.user_metadata` to `any` in **6 different places** across `_layout.tsx` and `login.tsx`. If Supabase changes the metadata shape or returns unexpected values, these will silently produce `undefined` or crash at runtime.

**Example pattern (repeated everywhere):**
```ts
(sess.user.user_metadata as any)?.full_name ||
(sess.user.user_metadata as any)?.name ||
undefined
```

**Recommendation:** Create a single helper function:
```ts
function extractUserMeta(sess: Session) { ... }
```

---

### 7. `any` types in store interface

**File:** `apps/mobile/src/store/index.ts`

The `FiadoMobileState` interface declares:
```ts
setUser: (user: any) => void;
enqueueSync: (type: PendingQueueItem['type'], payload: any) => void;
```

And `normalizeCustomerForSupabase` takes `input: any`. This bypasses all TypeScript checks when passing data around. A wrong field name or missing property silently produces `null` or `undefined`.

**Recommendation:** Define proper interfaces for user objects and sync payloads.

---

### 8. `editHistoryItem` always creates an audit log, even for no-op saves

**File:** `apps/mobile/src/store/index.ts` — `editHistoryItem()`

Every time the edit function is called, it inserts an audit item:
```ts
const auditLog: HistoryItem = {
  id: 'hist_' + Date.now(),
  description: `Auditoria: Edição do item`,
  ...
};
```

If the user opens the edit dialog and saves without changing anything, a useless audit entry is still created. This pollutes the history and consumes plan transaction limits unnecessarily (see bug #10).

**Recommendation:** Compare old and new values, and only create the audit log if something actually changed.

---

### 9. `isEmoji()` helper is incorrect

**File:** `apps/mobile/src/store/index.ts` and `apps/mobile/src/components/CustomerRow.tsx`

```ts
function isEmoji(str?: string) {
  if (!str) return false;
  const s = String(str);
  return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
}
```

This returns `true` for plain text strings like `"abc"` or `"test"`. It's meant to distinguish emoji avatars from image URIs, but it will misclassify short text strings as emoji, causing them to be rendered as `<Text>` instead of as `<Image>`.

**Recommendation:** Use a Unicode emoji regex (e.g., `/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)+$/u`).

---

## 🟡 MODERATE (business logic, UX, edge cases)

### 10. System/audit transactions count toward free plan limits

**File:** `apps/mobile/src/store/index.ts` — `getCurrentMonthTransactionsCount()`

```ts
if (h.type === 'debt' || h.type === 'payment' || h.type === 'system') {
  count++;
}
```

The `system` type includes audit logs (e.g., "Profile Updated", "Audit: item edited"). These inflate the transaction count and can trigger the free plan limit (30/month) even when the user has made only a few real sales.

**Recommendation:** Exclude `system` type from the transaction count.

---

### 11. Deleting a temporary customer leaves orphaned mappings

**File:** `apps/mobile/src/store/index.ts` — `deleteCustomer()`

When a customer has a temporary ID (starts with `cust_`), `deleteCustomer` does not enqueue a server-side delete. However, if the customer is later created on the server through background sync, `customerIdMap` will map the temp ID to a real UUID — but the customer was already removed from the local list. This orphaned mapping can cause issues if other sync items reference the old temp ID.

---

### 12. `editCustomer` doesn't sync photo removal when switching to emoji

**File:** `apps/mobile/src/store/index.ts` — `editCustomer()`

If a customer has a real photo URI and the user switches it to an emoji string, `editCustomer` only adds `clear_photo: true` to the sync payload when `picture === ''`. For emoji strings (non-empty, not a URI), no clear is sent — the server keeps the old photo while the app displays an emoji. **Local and server state diverge.**

---

### 13. `refreshCustomerPictureUrls` makes sequential requests for every customer

**File:** `apps/mobile/src/store/index.ts` — `refreshCustomerPictureUrls()`

```ts
for (const c of list) {
  const url = await signedUrlForCustomerPicture(path);  // one at a time
}
```

If a store has 50+ customers with profile pictures, this makes 50+ sequential HTTP requests to Supabase Storage. On a slow connection, this could take 30+ seconds.

**Recommendation:** Use `Promise.allSettled()` with a concurrency limit (e.g., 5 requests at a time).

---

### 14. Google Sign-In configured lazily — first call may fail

**File:** `apps/mobile/src/auth/googleNative.ts`

`configureGoogleNativeIfNeeded()` is only called inside `getGoogleIdTokenViaNative()`. If someone calls `isGoogleNativeEnabled()` separately (it just checks the env var), `GoogleSignin` is not configured. The first call that needs configuration may have a race condition or fail depending on timing.

---

### 15. IAP module detection via try/catch require is fragile

**File:** `apps/mobile/app/(tabs)/subscription.native.tsx`

```ts
let useIAPHook: any = null;
try {
  useIAPHook = require('react-native-iap')?.useIAP;
} catch {
  useIAPHook = null;
}
```

JavaScript bundlers (Metro, Webpack) often resolve `require()` at build time, so the catch block may never execute. The screen will either work or crash on import, defeating the purpose of the graceful fallback.

**Recommendation:** Use `Platform.OS` checks and conditional imports with `expo-dev-client` or dynamic `import()`.

---

### 16. Console logs may leak sensitive URL structure in production

**File:** `apps/mobile/app/(auth)/login.tsx`

```ts
console.log('[Auth] OAuth callback', {
  hasCode: Boolean(code),
  ...
  safeUrl,
});
```

While tokens and codes are masked, the log still exposes the app's internal URL structure and parameter names. This is a minor information leak.

**Recommendation:** Wrap in `if (__DEV__)` block.

---

### 17. Facebook login handler duplicates Google login logic

**File:** `apps/mobile/app/(auth)/login.tsx`

`handleFacebookLogin()` is a near-exact copy of the OAuth callback handling in `handleGoogleLogin()`. The `getParam` helper is defined twice, and the entire token/code exchange flow is duplicated. Any bug fix in one handler would need to be manually applied to the other.

**Recommendation:** Extract the shared OAuth callback handling into a reusable function:
```ts
async function handleOAuthCallback(provider: 'google' | 'facebook') { ... }
```

---

## 🔵 MINOR (code quality, maintainability)

### 18. Unused styles in components

- `NovoFiadoPopup.tsx`: Styles `wrapper`, `headerLeft`, `closeBtn`, `closeText`, `reminderChip`, `reminderChipActive`, `reminderText`, `reminderTextActive`, `whatsappIcon` are defined but never used.
- `CustomerRow.tsx`: `avatarImage` style conflicts with inline `width/height/borderRadius` set directly on the `Image` component.

### 19. `logout` function exists in API package but `signOut` is imported everywhere else

**File:** `packages/api/index.ts` exports `signOut`, but there's no `logout` alias. Some screens might try to call `api.logout()` — worth checking.

### 20. No loading state for subscription fetch

When `fetchSubscription()` runs on login, there's no `isLoading` flag in the store. The UI immediately shows default values (`plan_id: 'free'`, `max_customers: 2`, etc.) until the RPC returns. This means a user could see "2 customers max" for a few seconds before the UI updates to their actual plan limits.

---

## ✅ WHAT'S DONE WELL

- **Offline sync system** handles temporary IDs, maps them to real UUIDs, and gracefully pauses on network errors.
- **Zustand persist migration** correctly strips `user` and `authChecked` from AsyncStorage to prevent stale auth state.
- **Free plan enforcement** is consistent across `addCustomer`, `addDebt`, `receivePayment`, and `editHistoryItem`.
- **LayoutAnimation** on the login screen for smooth transitions between signin/signup/forgot modes.
- **Profile bootstrap** before DB operations ensures `business_id` is always available.
- **Comprehensive validation** in `NovoClientePopup` (CPF/CNPJ checkers, CEP auto-fill, CNPJ auto-fill via BrasilAPI).
