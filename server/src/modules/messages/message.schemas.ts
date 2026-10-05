import { z } from 'zod';

import { uuidSchema } from '../../shared/validation/common-schemas.js';

export const messageHistoryQuerySchema = z
  .object({
    beforeSequence: z.coerce.number().int().positive().optional(),
    afterSequence: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(
    ({ beforeSequence, afterSequence }) => beforeSequence === undefined || afterSequence === undefined,
    'Укажите только один cursor'
  );

export const messageSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageBodySchema = z.object({
  clientMessageId: uuidSchema,
  body: z.string(),
  replyToMessageId: uuidSchema.optional(),
  forwardedFromMessageId: uuidSchema.optional(),
});
export const socketSendMessageSchema = sendMessageBodySchema.extend({ conversationId: uuidSchema });
export const updateReadBodySchema = z.object({ sequence: z.number().int().nonnegative() });
export const socketUpdateReadSchema = updateReadBodySchema.extend({ conversationId: uuidSchema });
export const toggleReactionBodySchema = z.object({
  emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '🔥']),
});
