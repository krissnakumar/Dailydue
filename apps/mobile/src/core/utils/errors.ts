export class AppError extends Error {
  constructor(
    public override message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, status?: number) {
    super(message, 'NETWORK_ERROR', status);
    this.name = 'NetworkError';
  }
}
