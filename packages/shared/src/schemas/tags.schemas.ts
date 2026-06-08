import { z } from 'zod';

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex string like #RRGGBB').optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex string like #RRGGBB')
    .optional()
    .nullable(),
});
