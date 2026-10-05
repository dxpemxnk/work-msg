import type { IncomingMessage } from 'node:http';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errors } from '../../shared/errors/errors.js';
import type { UserRepository } from '../users/user.repository.js';
import { SESSION_COOKIE } from './auth.constants.js';

function requireSignedUserId(
  signedCookie: string | undefined,
  unsignCookie: (value: string) => { valid: boolean; value: string | null }
): string {
  if (!signedCookie) throw errors.unauthenticated();
  const { valid, value } = unsignCookie(signedCookie);
  if (!valid || !value) throw errors.unauthenticated();
  return value;
}

export function userIdFromHttpRequest(request: FastifyRequest, users: UserRepository): string {
  const userId = requireSignedUserId(request.cookies[SESSION_COOKIE], (value) => request.unsignCookie(value));
  users.requireActive(userId);
  return userId;
}

export function userIdFromSocketRequest(
  app: FastifyInstance,
  request: IncomingMessage,
  users: UserRepository
): string {
  const cookies = app.parseCookie(request.headers.cookie ?? '');
  const userId = requireSignedUserId(cookies[SESSION_COOKIE], (value) => app.unsignCookie(value));
  users.requireActive(userId);
  return userId;
}

