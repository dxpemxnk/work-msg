import { AppError } from './app-error.js';

export const errors = {
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'Требуется авторизация', 401),
  forbidden: (message = 'Доступ запрещён') => new AppError('FORBIDDEN', message, 403),
  notFound: (message = 'Объект не найден') => new AppError('NOT_FOUND', message, 404),
  validation: (message: string) => new AppError('VALIDATION_FAILED', message, 400),
  conflict: (message: string) => new AppError('CONFLICT', message, 409),
};

