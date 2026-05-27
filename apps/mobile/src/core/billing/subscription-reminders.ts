import nativeNotifications from '../native/notifications';
import { UserSubscriptionState } from '../../types';

const SUBSCRIPTION_RENEWAL_TAG = 'subscription_renewal';
const DAY_SECONDS = 24 * 60 * 60;

function secondsUntil(dateIso: string) {
  const ms = Date.parse(dateIso) - Date.now();
  return Math.floor(ms / 1000);
}

export async function syncSubscriptionRenewalReminders(subscription: UserSubscriptionState) {
  // Keep schedule deterministic: clear older renewal reminders before creating new ones.
  await nativeNotifications.cancelScheduledByTag(SUBSCRIPTION_RENEWAL_TAG);

  if (!subscription.is_premium || !subscription.current_period_end) return;
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return;

  const { status } = await nativeNotifications.requestPermissions();
  if (status !== 'granted') return;

  const seconds3d = secondsUntil(subscription.current_period_end) - 3 * DAY_SECONDS;
  const seconds1d = secondsUntil(subscription.current_period_end) - 1 * DAY_SECONDS;

  if (seconds3d > 60) {
    await nativeNotifications.scheduleNotification(
      'Premium renewal soon',
      'Your Premium subscription renews in about 3 days. Check your payment method in Google Play.',
      seconds3d,
      { tag: SUBSCRIPTION_RENEWAL_TAG, reminder: 'd3' }
    );
  }

  if (seconds1d > 60) {
    await nativeNotifications.scheduleNotification(
      'Premium renews tomorrow',
      'Your Premium subscription renews in about 24 hours. Make sure your payment method is valid.',
      seconds1d,
      { tag: SUBSCRIPTION_RENEWAL_TAG, reminder: 'd1' }
    );
  }
}
