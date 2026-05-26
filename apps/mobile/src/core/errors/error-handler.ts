import { AppError } from './AppError';
import { logger } from '../utils/logger';
import { tracker } from '../analytics/tracker';

export const sentryFacade = {
  captureException: (error: any, context?: Record<string, any>) => {
    console.error('[Sentry captureException]', error, context);
    logger.error(`[Sentry Bridge] Exception captured: ${error?.message || error}`, {
      error,
      context,
    });
  },
  captureMessage: (message: string, severity: 'info' | 'warning' | 'error' = 'info') => {
    console.log(`[Sentry captureMessage] [${severity}] ${message}`);
    logger.info(`[Sentry Bridge] Message captured: ${message}`, { severity });
  }
};

export const errorHandler = {
  handleError: (error: any, context?: string): AppError => {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError(error.message, 'UNEXPECTED_SYSTEM_ERROR', 'error', error);
    } else {
      appError = new AppError(typeof error === 'string' ? error : 'An unexpected error occurred', 'UNKNOWN_ERROR', 'error', error);
    }

    logger.error(`[Central Error Handler] [${appError.code}] [${context || 'global'}]: ${appError.message}`, {
      code: appError.code,
      severity: appError.severity,
      originalError: appError.originalError,
    });

    if (appError.severity === 'fatal' || appError.severity === 'error') {
      sentryFacade.captureException(appError.originalError || appError, {
        context,
        code: appError.code,
        severity: appError.severity,
      });
      tracker.trackCrash(appError.message, appError.severity === 'fatal');
    }

    return appError;
  }
};

export default errorHandler;
