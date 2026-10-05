export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'AppError';
  }
}

