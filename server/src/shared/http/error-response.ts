import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface ErrorResponse {
  statusCode: number;
  body: ErrorBody;
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: { error: { code: error.code, message: error.message } } };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: error.issues[0]?.message ?? 'Некорректные данные',
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: { error: { code: 'TEMPORARY_FAILURE', message: 'Внутренняя ошибка сервера' } },
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error);
    if (response.statusCode >= 500) request.log.error({ err: error }, 'request failed');
    void reply.status(response.statusCode).send(response.body);
  });
}

