import type { z } from 'zod';
import type { PublicNote, ShareLink } from 'shared';
import { CreateShareSchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function toShareLink(link: {
  id: string;
  noteId: string;
  userId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}): ShareLink {
  return {
    id: link.id,
    noteId: link.noteId,
    userId: link.userId,
    token: link.token,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  };
}

export async function createShareLink(
  userId: string,
  noteId: string,
  dto: z.infer<typeof CreateShareSchema>,
): Promise<ShareLink> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);

  const link = await prisma.shareLink.create({
    data: {
      noteId,
      userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    },
  });
  return toShareLink(link);
}

export async function listShareLinks(
  userId: string,
  noteId: string,
): Promise<ShareLink[]> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);

  const links = await prisma.shareLink.findMany({
    where: { noteId },
    orderBy: { createdAt: 'desc' },
  });
  return links.map(toShareLink);
}

export async function revokeShareLink(
  userId: string,
  shareId: string,
): Promise<void> {
  const link = await prisma.shareLink.findFirst({
    where: { id: shareId, userId },
  });
  if (!link) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await prisma.shareLink.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

export async function getPublicNote(
  token: string,
): Promise<PublicNote> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { note: true },
  });

  const now = new Date();
  const isActive =
    link !== null &&
    link.revokedAt === null &&
    (link.expiresAt === null || link.expiresAt > now);
  const accessible = isActive && link!.note.deletedAt === null;

  if (!accessible) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await prisma.shareLink.update({
    where: { token },
    data: { viewCount: { increment: 1 } },
  });

  return {
    title: link!.note.title,
    content: link!.note.content as object | null,
  };
}
