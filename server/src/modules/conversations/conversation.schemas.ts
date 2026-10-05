import { z } from 'zod';

import { uuidSchema } from '../../shared/validation/common-schemas.js';

export const createDirectSchema = z.object({ userId: uuidSchema });
export const createGroupSchema = z.object({ title: z.string(), memberIds: z.array(uuidSchema).min(1) });
export const updateTitleSchema = z.object({ title: z.string() });
export const memberParamsSchema = z.object({ id: uuidSchema, userId: uuidSchema });
export const addMemberSchema = z.object({ userId: uuidSchema });

