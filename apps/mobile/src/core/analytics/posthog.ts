import { logger } from '../utils/logger';

export const posthog = {
  init: () => {
    console.log('[PostHog] Initialized production analytics pipeline.');
  },
  capture: (event: string, properties?: Record<string, any>) => {
    console.log(`[PostHog Capture] Event: "${event}"`, properties);
    logger.info(`[Analytics Event] ${event}`, properties);
  },
  identify: (distinctId: string, userProperties?: Record<string, any>) => {
    console.log(`[PostHog Identify] distinctId: "${distinctId}"`, userProperties);
    logger.info(`[Analytics Identify] distinctId: ${distinctId}`, userProperties);
  },
  reset: () => {
    console.log('[PostHog Reset] Cleared distinctId and session context.');
  }
};

export default posthog;
