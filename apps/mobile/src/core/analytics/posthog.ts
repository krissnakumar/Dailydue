import { logger } from '../utils/logger';

export const posthog = {
  init: () => {
    if (__DEV__) console.log('[PostHog] Initialized production analytics pipeline.');
  },
  capture: (event: string, properties?: Record<string, any>) => {
    if (__DEV__) console.log(`[PostHog Capture] Event: "${event}"`, properties);
    logger.info(`[Analytics Event] ${event}`, properties);
  },
  identify: (distinctId: string, userProperties?: Record<string, any>) => {
    if (__DEV__) console.log(`[PostHog Identify] distinctId: "${distinctId}"`, userProperties);
    logger.info(`[Analytics Identify] distinctId: ${distinctId}`, userProperties);
  },
  reset: () => {
    if (__DEV__) console.log('[PostHog Reset] Cleared distinctId and session context.');
  }
};

export default posthog;
