import { z } from 'zod';

export const CreateShareSchema = z.object({
  expiresAt: z
    .string()
    .datetime()
    .refine(d => new Date(d) > new Date(), {
      message: 'Expiry date must be in the future',
    })
    .optional(),
});
