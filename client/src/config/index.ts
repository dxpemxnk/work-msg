export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:4100';

export const MESSAGE_MAX_LENGTH = 8000;
