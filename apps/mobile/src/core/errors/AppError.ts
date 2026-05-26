export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export class AppError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly originalError?: any;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', severity: ErrorSeverity = 'error', originalError?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.severity = severity;
    this.originalError = originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
