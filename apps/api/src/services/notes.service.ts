import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { NoteDetail, NoteListItem, PaginationMeta } from 'shared';
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

// as const preserves exact shape so Prisma can infer the full return type with relations
const NOTE_INCLUDE = {
  tags: { include: { tag: true } },
  _count: { select: { shareLinks: true } },
} as const;

type NoteWithRelations = Prisma.NoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

const LIST_INCLUDE = {
  tags: { include: { tag: true } },
} as const;

type NoteListRow = Prisma.NoteGetPayload<{ include: typeof LIST_INCLUDE }>;

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  if (!Array.isArray(n.content)) return '';
  return (n.content as unknown[]).map(extractText).join(' ');
}

function toNoteDetail(note: NoteWithRelations): NoteDetail {
  return {
    id: note.id,
    title: note.title,
    content: note.content as object | null,
    tags: note.tags.map(nt => ({
      id: nt.tag.id,
      name: nt.tag.name,
      color: nt.tag.color,
    })),
    shareLinksCount: note._count.shareLinks,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

// Converts unknown content (from Zod z.unknown()) to a Prisma-safe nullable JSON value
function toJsonInput(content: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return content != null ? (content as Prisma.InputJsonValue) : Prisma.DbNull;
}

async function validateTags(tagIds: string[], userId: string): Promise<void> {
  if (tagIds.length > 5)
    throw new AppError('TOO_MANY_TAGS', 'A note can have at most 5 tags.', 400);
  const owned = await prisma.tag.findMany({ where: { id: { in: tagIds }, userId } });
  if (owned.length !== tagIds.length)
    throw new AppError('INVALID_TAG', 'One or more selected tags are invalid.', 400);
}

export async function create(
  userId: string,
  dto: z.infer<typeof CreateNoteSchema>,
): Promise<NoteDetail> {
  if (dto.tagIds && dto.tagIds.length > 0) {
    await validateTags(dto.tagIds, userId);
  }

  const note = await prisma.note.create({
    data: {
      userId,
      title: dto.title,
      content: toJsonInput(dto.content),
      contentText: extractText(dto.content),
      tags: {
        create: (dto.tagIds ?? []).map(tagId => ({ tagId })),
      },
    },
    include: NOTE_INCLUDE,
  });

  return toNoteDetail(note);
}

export async function getById(userId: string, noteId: string): Promise<NoteDetail> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
    include: NOTE_INCLUDE,
  });
  if (!note) throw new AppError('NOT_FOUND', 'Note not found.', 404);
  return toNoteDetail(note);
}

export async function update(
  userId: string,
  noteId: string,
  dto: z.infer<typeof UpdateNoteSchema>,
): Promise<NoteDetail> {
  const current = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!current) throw new AppError('NOT_FOUND', 'Note not found.', 404);

  if (dto.title !== undefined && dto.title.trim() === '')
    throw new AppError('TITLE_REQUIRED', 'Title is required.', 400);

  if (dto.tagIds && dto.tagIds.length > 0) {
    await validateTags(dto.tagIds, userId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.noteVersion.create({
      data: {
        noteId,
        title: current.title,
        content: toJsonInput(current.content),
      },
    });

    if (dto.tagIds !== undefined) {
      await tx.noteTag.deleteMany({ where: { noteId } });
      if (dto.tagIds.length > 0) {
        await tx.noteTag.createMany({
          data: dto.tagIds.map(tagId => ({ noteId, tagId })),
        });
      }
    }

    await tx.note.update({
      where: { id: noteId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && {
          content: toJsonInput(dto.content),
          contentText: extractText(dto.content),
        }),
      },
    });

    const versions = await tx.noteVersion.findMany({
      where: { noteId },
      orderBy: { savedAt: 'asc' },
      select: { id: true },
    });
    if (versions.length > 50) {
      const toDelete = versions.slice(0, versions.length - 50).map(v => v.id);
      await tx.noteVersion.deleteMany({ where: { id: { in: toDelete } } });
    }
  });

  return getById(userId, noteId);
}

export async function softDelete(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Note not found.', 404);
  await prisma.note.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
}

export async function list(
  userId: string,
  query: z.infer<typeof NoteListQuerySchema>,
): Promise<{ data: NoteListItem[]; meta: PaginationMeta }> {
  const { page, limit, sortBy, sortOrder, tags } = query;

  const tagIds = tags ? tags.split(',').filter(Boolean) : [];

  if (tagIds.length > 0) {
    const owned = await prisma.tag.findMany({ where: { id: { in: tagIds }, userId } });
    if (owned.length !== tagIds.length)
      throw new AppError('INVALID_TAG', 'One or more specified tags are invalid.', 400);
  }

  const where: Prisma.NoteWhereInput = {
    userId,
    deletedAt: null,
    ...(tagIds.length > 0 && {
      AND: tagIds.map(id => ({ tags: { some: { tagId: id } } })),
    }),
  };

  const [total, notes] = (await prisma.$transaction([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      orderBy: { [sortBy]: sortOrder } as Prisma.NoteOrderByWithRelationInput,
      skip: (page - 1) * limit,
      take: limit,
      include: LIST_INCLUDE,
    }),
  ])) as [number, NoteListRow[]];

  const data: NoteListItem[] = notes.map(note => ({
    id: note.id,
    title: note.title,
    contentPreview: (note.contentText ?? '').slice(0, 150),
    tags: note.tags.map(nt => ({ id: nt.tag.id, name: nt.tag.name, color: nt.tag.color })),
    updatedAt: note.updatedAt.toISOString(),
  }));

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
