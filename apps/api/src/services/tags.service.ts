import type { z } from 'zod';
import type { TagSummary, TagWithCount } from 'shared';
import { CreateTagSchema, UpdateTagSchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function toTagSummary(tag: { id: string; name: string; color: string | null }): TagSummary {
  return { id: tag.id, name: tag.name, color: tag.color };
}

async function checkNameConflict(userId: string, name: string, excludeId?: string): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  if (existing) throw new AppError('TAG_NAME_TAKEN', 'You already have a tag with this name.', 409);
}

export async function listTags(userId: string): Promise<TagWithCount[]> {
  const tags = await prisma.tag.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          notes: { where: { note: { deletedAt: null } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    noteCount: tag._count.notes,
  }));
}

export async function createTag(
  userId: string,
  dto: z.infer<typeof CreateTagSchema>,
): Promise<TagSummary> {
  await checkNameConflict(userId, dto.name);
  const tag = await prisma.tag.create({
    data: { userId, name: dto.name, color: dto.color ?? null },
  });
  return toTagSummary(tag);
}

export async function updateTag(
  userId: string,
  tagId: string,
  dto: z.infer<typeof UpdateTagSchema>,
): Promise<TagSummary> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new AppError('NOT_FOUND', 'Tag not found.', 404);

  if (dto.name !== undefined) {
    await checkNameConflict(userId, dto.name, tagId);
  }

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.color !== undefined && { color: dto.color }),
    },
  });
  return toTagSummary(updated);
}

export async function deleteTag(userId: string, tagId: string): Promise<void> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new AppError('NOT_FOUND', 'Tag not found.', 404);
  await prisma.tag.delete({ where: { id: tagId } });
}
