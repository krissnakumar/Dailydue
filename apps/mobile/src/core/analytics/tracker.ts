import { posthog } from './posthog';
import { AnalyticsEvents } from './events';

export const tracker = {
  trackScreenView: (screenName: string, durationMs?: number) => {
    posthog.capture(AnalyticsEvents.SCREEN_VIEWED, {
      screen: screenName,
      duration_ms: durationMs,
    });
  },

  trackSyncFailure: (error: string, queueLength: number) => {
    posthog.capture(AnalyticsEvents.SYNC_FAILED, {
      error_message: error,
      pending_queue_length: queueLength,
    });
  },

  trackCrash: (error: string, fatal: boolean = true) => {
    posthog.capture(AnalyticsEvents.APP_CRASHED, {
      error_message: error,
      is_fatal: fatal,
    });
  },

  trackOnboarding: (step: 'started' | 'completed' | string) => {
    const event = step === 'completed' ? AnalyticsEvents.ONBOARDING_COMPLETED : AnalyticsEvents.ONBOARDING_STARTED;
    posthog.capture(event, {
      step_name: step,
    });
  },

  trackBillingFailure: (productId: string, error: string) => {
    posthog.capture(AnalyticsEvents.BILLING_UPGRADE_FAILED, {
      product_id: productId,
      error_message: error,
    });
  },

  trackSlowScreen: (screenName: string, loadTimeMs: number) => {
    if (loadTimeMs > 1000) {
      posthog.capture(AnalyticsEvents.SLOW_SCREEN_RENDER, {
        screen: screenName,
        load_time_ms: loadTimeMs,
      });
    }
  }
};

export default tracker;
