import type { NoteDetail, VersionListItem } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import * as notesService from './notes.service.js';

type VersionDetail = { id: string; title: string; content: object | null; savedAt: string };

async function assertNoteOwnership(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);
}

export async function listVersions(userId: string, noteId: string): Promise<VersionListItem[]> {
  await assertNoteOwnership(userId, noteId);
  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    orderBy: { savedAt: 'desc' },
    select: { id: true, savedAt: true },
  });
  return versions.map(v => ({ id: v.id, savedAt: v.savedAt.toISOString() }));
}

export async function getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<VersionDetail> {
  await assertNoteOwnership(userId, noteId);
  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return {
    id: version.id,
    title: version.title,
    content: version.content as object | null,
    savedAt: version.savedAt.toISOString(),
  };
}

export async function restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteDetail> {
  await assertNoteOwnership(userId, noteId);
  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return notesService.update(userId, noteId, {
    title: version.title,
    content: version.content as unknown,
  });
}
