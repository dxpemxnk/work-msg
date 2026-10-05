import { AppError } from '../shared/errors/app-error.js';
import { toErrorResponse } from '../shared/http/error-response.js';
import type { SocketFailure } from '../modules/messages/message.types.js';

export function toSocketFailure(error: unknown): SocketFailure {
  const response = toErrorResponse(error);
  return {
    ok: false,
    error: {
      code: response.body.error.code,
      message: response.body.error.message,
      retryable: error instanceof AppError ? error.retryable : true,
    },
  };
}

