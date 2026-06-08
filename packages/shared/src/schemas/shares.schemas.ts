import { z } from 'zod';

export const CreateShareSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});
