export const AnalyticsEvents = {
  // Sync
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Crashes & Errors
  APP_CRASHED: 'app_crashed',
  APP_ERROR_OCCURRED: 'app_error_occurred',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Billing
  BILLING_UPGRADE_STARTED: 'billing_upgrade_started',
  BILLING_UPGRADE_SUCCESS: 'billing_upgrade_success',
  BILLING_UPGRADE_FAILED: 'billing_upgrade_failed',
  BILLING_RESTORE_STARTED: 'billing_restore_started',
  BILLING_RESTORE_SUCCESS: 'billing_restore_success',

  // Slow Screens
  SLOW_SCREEN_RENDER: 'slow_screen_render',
  SCREEN_VIEWED: 'screen_viewed'
} as const;

export type AnalyticsEventName = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];
