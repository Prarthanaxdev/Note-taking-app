import { z } from 'zod';

export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.unknown().optional(),
  tagIds: z.string().cuid().array().max(5).optional(),
});

export const UpdateNoteSchema = CreateNoteSchema.partial();

export const NoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags: z.string().optional(),
});
