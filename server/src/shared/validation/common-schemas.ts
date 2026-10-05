import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const idParamsSchema = z.object({ id: uuidSchema });

