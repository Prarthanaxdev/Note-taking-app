import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    note: { findFirst: vi.fn() },
    noteVersion: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('../notes.service.js', () => ({
  update: vi.fn(),
}));

import { prisma } from '../../lib/prisma.js';
import * as notesService from '../notes.service.js';
import { listVersions, getVersion, restoreVersion } from '../versions.service.js';

type MockPrisma = {
  note: { findFirst: ReturnType<typeof vi.fn> };
  noteVersion: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma = prisma as unknown as MockPrisma;
const mockNotesService = notesService as unknown as { update: ReturnType<typeof vi.fn> };

function mockNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    title: 'Test Note',
    content: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function mockVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-1',
    noteId: 'note-1',
    title: 'Old Title',
    content: null,
    savedAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  };
}

function mockNoteDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: null,
    tags: [],
    shareLinksCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ── listVersions ──────────────────────────────────────────────────────────────

describe('listVersions', () => {
  it('VER-UT-01: note owned → returns VersionListItem[] with ISO savedAt', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findMany.mockResolvedValue([
      mockVersion({ id: 'ver-2', savedAt: new Date('2026-02-01T00:00:00.000Z') }),
      mockVersion({ id: 'ver-1', savedAt: new Date('2026-01-01T00:00:00.000Z') }),
    ]);

    const result = await listVersions('user-1', 'note-1');

    expect(mockPrisma.noteVersion.findMany).toHaveBeenCalledWith({
      where: { noteId: 'note-1' },
      orderBy: { savedAt: 'desc' },
      select: { id: true, savedAt: true },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'ver-2', savedAt: '2026-02-01T00:00:00.000Z' });
    expect(result[1]).toEqual({ id: 'ver-1', savedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('VER-UT-02: note not found → throws NOT_FOUND; findMany not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(listVersions('user-1', 'note-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    expect(mockPrisma.noteVersion.findMany).not.toHaveBeenCalled();
  });

  it('VER-UT-03: no versions → returns empty array', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findMany.mockResolvedValue([]);

    const result = await listVersions('user-1', 'note-1');
    expect(result).toEqual([]);
  });
});

// ── getVersion ────────────────────────────────────────────────────────────────

describe('getVersion', () => {
  it('VER-UT-04: version found → returns { id, title, content, savedAt }', async () => {
    const content = { type: 'doc', content: [] };
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findFirst.mockResolvedValue(mockVersion({ content }));

    const result = await getVersion('user-1', 'note-1', 'ver-1');

    expect(mockPrisma.noteVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'ver-1', noteId: 'note-1' },
    });
    expect(result).toEqual({
      id: 'ver-1',
      title: 'Old Title',
      content,
      savedAt: '2026-01-01T10:00:00.000Z',
    });
  });

  it('VER-UT-05: note not found → throws NOT_FOUND; noteVersion.findFirst not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(getVersion('user-1', 'note-1', 'ver-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    expect(mockPrisma.noteVersion.findFirst).not.toHaveBeenCalled();
  });

  it('VER-UT-06: version not found under note → throws NOT_FOUND', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findFirst.mockResolvedValue(null);

    await expect(getVersion('user-1', 'note-1', 'ver-bad')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ── restoreVersion ────────────────────────────────────────────────────────────

describe('restoreVersion', () => {
  it('VER-UT-07: valid version → delegates to notesService.update with title+content', async () => {
    const content = { type: 'doc' };
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findFirst.mockResolvedValue(
      mockVersion({ title: 'Old Title', content }),
    );
    const detail = mockNoteDetail({ title: 'Old Title' });
    mockNotesService.update.mockResolvedValue(detail);

    const result = await restoreVersion('user-1', 'note-1', 'ver-1');

    expect(mockNotesService.update).toHaveBeenCalledWith('user-1', 'note-1', {
      title: 'Old Title',
      content,
    });
    expect(result).toEqual(detail);
  });

  it('VER-UT-08: note not found → throws NOT_FOUND; update not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(restoreVersion('user-1', 'note-1', 'ver-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    expect(mockNotesService.update).not.toHaveBeenCalled();
  });

  it('VER-UT-09: version not found → throws NOT_FOUND; update not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.noteVersion.findFirst.mockResolvedValue(null);

    await expect(restoreVersion('user-1', 'note-1', 'ver-bad')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    expect(mockNotesService.update).not.toHaveBeenCalled();
  });
});
