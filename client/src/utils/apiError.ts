import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

export function apiErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return 'Произошла неизвестная ошибка';
  }
  const queryError = error as FetchBaseQueryError;
  if (queryError.status === 'FETCH_ERROR') return 'Сервер мессенджера недоступен';
  if (queryError.status === 'TIMEOUT_ERROR') return 'Сервер не ответил вовремя';
  if ('data' in queryError && typeof queryError.data === 'object' && queryError.data !== null) {
    const payload = queryError.data as ErrorPayload;
    if (payload.error?.message) return payload.error.message;
  }
  return 'Не удалось выполнить запрос';
}

