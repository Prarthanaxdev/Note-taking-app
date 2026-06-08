import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    note: {
      findFirst: vi.fn(),
    },
    shareLink: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma.js';
import { createShareLink, listShareLinks, revokeShareLink, getPublicNote } from '../shares.service.js';

type MockPrisma = {
  note: { findFirst: ReturnType<typeof vi.fn> };
  shareLink: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma = prisma as unknown as MockPrisma;

function mockNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    title: 'Test Note',
    content: null,
    contentText: '',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function mockLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    noteId: 'note-1',
    userId: 'user-1',
    token: 'uuid-token-1',
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ── createShareLink ───────────────────────────────────────────────────────────

describe('createShareLink', () => {
  it('SHARE-UT-01: note owned by user → creates and returns ShareLink', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.shareLink.create.mockResolvedValue(mockLink());

    const result = await createShareLink('user-1', 'note-1', {});

    expect(mockPrisma.shareLink.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'link-1',
      noteId: 'note-1',
      userId: 'user-1',
      token: 'uuid-token-1',
      viewCount: 0,
      revokedAt: null,
    });
    expect(typeof result.createdAt).toBe('string');
  });

  it('SHARE-UT-02: note not found → throws NOT_FOUND; create not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(createShareLink('user-1', 'note-1', {})).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.shareLink.create).not.toHaveBeenCalled();
  });

  it('SHARE-UT-03: expiresAt provided → create called with Date', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.shareLink.create.mockResolvedValue(
      mockLink({ expiresAt: new Date('2099-01-01T00:00:00.000Z') }),
    );

    await createShareLink('user-1', 'note-1', { expiresAt: '2099-01-01T00:00:00.000Z' });

    const callData = mockPrisma.shareLink.create.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    expect(callData.data.expiresAt).toEqual(new Date('2099-01-01T00:00:00.000Z'));
  });

  it('SHARE-UT-04: no expiresAt → create called with null', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.shareLink.create.mockResolvedValue(mockLink());

    await createShareLink('user-1', 'note-1', {});

    const callData = mockPrisma.shareLink.create.mock.calls[0][0] as {
      data: { expiresAt: null };
    };
    expect(callData.data.expiresAt).toBeNull();
  });
});

// ── listShareLinks ────────────────────────────────────────────────────────────

describe('listShareLinks', () => {
  it('SHARE-UT-05: returns all links as ShareLink[] with ISO date strings', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.shareLink.findMany.mockResolvedValue([
      mockLink({ id: 'link-1' }),
      mockLink({ id: 'link-2', revokedAt: new Date('2026-02-01') }),
    ]);

    const result = await listShareLinks('user-1', 'note-1');

    expect(result).toHaveLength(2);
    expect(typeof result[0].createdAt).toBe('string');
    expect(result[1].revokedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('SHARE-UT-06: note not found → throws NOT_FOUND; findMany not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(listShareLinks('user-1', 'note-1')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.shareLink.findMany).not.toHaveBeenCalled();
  });

  it('SHARE-UT-07: no share links → returns empty array', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote());
    mockPrisma.shareLink.findMany.mockResolvedValue([]);

    const result = await listShareLinks('user-1', 'note-1');

    expect(result).toEqual([]);
  });
});

// ── revokeShareLink ───────────────────────────────────────────────────────────

describe('revokeShareLink', () => {
  it('SHARE-UT-08: found with matching userId → sets revokedAt, returns void', async () => {
    mockPrisma.shareLink.findFirst.mockResolvedValue(mockLink());
    mockPrisma.shareLink.update.mockResolvedValue(mockLink({ revokedAt: new Date() }));

    const result = await revokeShareLink('user-1', 'link-1');

    expect(result).toBeUndefined();
    expect(mockPrisma.shareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'link-1' },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('SHARE-UT-09: link not found → throws NOT_FOUND; update not called', async () => {
    mockPrisma.shareLink.findFirst.mockResolvedValue(null);

    await expect(revokeShareLink('user-1', 'link-1')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
  });
});

// ── getPublicNote ─────────────────────────────────────────────────────────────

describe('getPublicNote', () => {
  function mockPublicLink(linkOverrides: Record<string, unknown> = {}, noteOverrides: Record<string, unknown> = {}) {
    return {
      ...mockLink(linkOverrides),
      note: mockNote(noteOverrides),
    };
  }

  it('SHARE-UT-10: active link → returns title+content and increments viewCount', async () => {
    mockPrisma.shareLink.findUnique.mockResolvedValue(mockPublicLink());
    mockPrisma.shareLink.update.mockResolvedValue(mockLink({ viewCount: 1 }));

    const result = await getPublicNote('uuid-token-1');

    expect(result).toEqual({ title: 'Test Note', content: null });
    expect(mockPrisma.shareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { viewCount: { increment: 1 } },
      }),
    );
  });

  it('SHARE-UT-11: token not found → throws NOT_FOUND; update not called', async () => {
    mockPrisma.shareLink.findUnique.mockResolvedValue(null);

    await expect(getPublicNote('bad-token')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
  });

  it('SHARE-UT-12: revokedAt set → throws NOT_FOUND; update not called', async () => {
    mockPrisma.shareLink.findUnique.mockResolvedValue(
      mockPublicLink({ revokedAt: new Date('2026-01-01') }),
    );

    await expect(getPublicNote('uuid-token-1')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
  });

  it('SHARE-UT-13: expiresAt in past → throws NOT_FOUND; update not called', async () => {
    mockPrisma.shareLink.findUnique.mockResolvedValue(
      mockPublicLink({ expiresAt: new Date('2000-01-01') }),
    );

    await expect(getPublicNote('uuid-token-1')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
  });

  it('SHARE-UT-14: note deletedAt set → throws NOT_FOUND; update not called', async () => {
    mockPrisma.shareLink.findUnique.mockResolvedValue(
      mockPublicLink({}, { deletedAt: new Date('2026-01-01') }),
    );

    await expect(getPublicNote('uuid-token-1')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
    expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
  });

  it('SHARE-UT-15: expiresAt null (permanent link) → returns title+content', async () => {
    const content = { type: 'doc', content: [] };
    mockPrisma.shareLink.findUnique.mockResolvedValue(
      mockPublicLink({ expiresAt: null }, { title: 'Permanent Note', content }),
    );
    mockPrisma.shareLink.update.mockResolvedValue(mockLink({ viewCount: 1 }));

    const result = await getPublicNote('uuid-token-1');

    expect(result).toEqual({ title: 'Permanent Note', content });
  });
});
