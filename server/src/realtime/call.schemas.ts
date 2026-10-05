import { z } from 'zod';

import { uuidSchema } from '../shared/validation/common-schemas.js';

const sessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1),
});

const iceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nonnegative().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

export const startCallSchema = z.object({
  callId: uuidSchema,
  conversationId: uuidSchema,
  mode: z.enum(['audio', 'video']),
  offer: sessionDescriptionSchema.extend({ type: z.literal('offer') }),
});

export const answerCallSchema = z.object({
  callId: uuidSchema,
  answer: sessionDescriptionSchema.extend({ type: z.literal('answer') }),
});

export const callIdSchema = z.object({ callId: uuidSchema });

export const callIceSchema = z.object({
  callId: uuidSchema,
  candidate: iceCandidateSchema,
});

export const groupCallJoinSchema = z.object({
  conversationId: uuidSchema,
  mode: z.enum(['audio', 'video']),
});

export const groupCallRelaySchema = z.object({
  conversationId: uuidSchema,
  targetUserId: uuidSchema,
  description: sessionDescriptionSchema,
});

export const groupCallIceSchema = z.object({
  conversationId: uuidSchema,
  targetUserId: uuidSchema,
  candidate: iceCandidateSchema,
});

export const groupCallLeaveSchema = z.object({ conversationId: uuidSchema });
