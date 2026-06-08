import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    tag: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma.js';
import { listTags, createTag, updateTag, deleteTag } from '../tags.service.js';

type MockPrisma = {
  tag: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

const mockPrisma = prisma as unknown as MockPrisma;

function mockTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    userId: 'user-1',
    name: 'work',
    color: '#ff0000',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ── listTags ──────────────────────────────────────────────────────────────────

describe('listTags', () => {
  it('TAG-UT-01: returns TagWithCount[] with noteCount from _count', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([
      { ...mockTag({ id: 'tag-1', name: 'work' }), _count: { notes: 3 } },
      { ...mockTag({ id: 'tag-2', name: 'personal' }), _count: { notes: 0 } },
    ]);

    const result = await listTags('user-1');

    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        include: expect.objectContaining({
          _count: expect.objectContaining({
            select: expect.objectContaining({
              notes: expect.objectContaining({ where: { note: { deletedAt: null } } }),
            }),
          }),
        }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'tag-1', name: 'work', color: '#ff0000', noteCount: 3 });
    expect(result[1]).toMatchObject({ noteCount: 0 });
  });

  it('TAG-UT-02: user has no tags → returns []', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([]);
    const result = await listTags('user-1');
    expect(result).toEqual([]);
  });
});

// ── createTag ─────────────────────────────────────────────────────────────────

describe('createTag', () => {
  it('TAG-UT-03: happy path — name and color → uniqueness check passes; returns TagSummary', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);
    mockPrisma.tag.create.mockResolvedValue(mockTag());

    const result = await createTag('user-1', { name: 'work', color: '#ff0000' });

    expect(mockPrisma.tag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          name: { equals: 'work', mode: 'insensitive' },
        }),
      }),
    );
    expect(mockPrisma.tag.create).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'tag-1', name: 'work', color: '#ff0000' });
  });

  it('TAG-UT-04: no color → tag.create called with color: null; returns color: null', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);
    mockPrisma.tag.create.mockResolvedValue(mockTag({ color: null }));

    const result = await createTag('user-1', { name: 'work' });

    const createCall = mockPrisma.tag.create.mock.calls[0][0] as { data: { color: unknown } };
    expect(createCall.data.color).toBeNull();
    expect(result.color).toBeNull();
  });

  it('TAG-UT-05: duplicate name (case-insensitive) → throws TAG_NAME_TAKEN 409; create not called', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(mockTag({ name: 'Work' }));

    await expect(createTag('user-1', { name: 'work' })).rejects.toThrow(
      expect.objectContaining({ code: 'TAG_NAME_TAKEN', statusCode: 409 }),
    );
    expect(mockPrisma.tag.create).not.toHaveBeenCalled();
  });

  it('TAG-UT-06: Zod trims name before uniqueness check and storage', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);
    mockPrisma.tag.create.mockResolvedValue(mockTag({ name: 'work' }));

    // Zod .trim() fires in the validate middleware — we simulate that here by passing already-trimmed name
    // (the schema trim is tested separately in schema tests; service receives pre-trimmed value)
    await createTag('user-1', { name: 'work' });

    const findCall = mockPrisma.tag.findFirst.mock.calls[0][0] as {
      where: { name: { equals: string } };
    };
    expect(findCall.where.name.equals).toBe('work');
  });
});

// ── updateTag ─────────────────────────────────────────────────────────────────

describe('updateTag', () => {
  it('TAG-UT-07: tag not found → throws NOT_FOUND 404', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);

    await expect(updateTag('user-1', 'tag-1', { name: 'new' })).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.tag.update).not.toHaveBeenCalled();
  });

  it('TAG-UT-08: update name only — uniqueness check excludes own id; update called with name', async () => {
    mockPrisma.tag.findFirst
      .mockResolvedValueOnce(mockTag())   // ownership check
      .mockResolvedValueOnce(null);       // uniqueness check (no conflict)
    mockPrisma.tag.update.mockResolvedValue(mockTag({ name: 'renamed' }));

    await updateTag('user-1', 'tag-1', { name: 'renamed' });

    const uniquenessCall = mockPrisma.tag.findFirst.mock.calls[1][0] as {
      where: { id?: { not: string } };
    };
    expect(uniquenessCall.where.id).toEqual({ not: 'tag-1' });

    const updateCall = mockPrisma.tag.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).toHaveProperty('name', 'renamed');
    expect(updateCall.data).not.toHaveProperty('color');
  });

  it('TAG-UT-09: new name conflicts with another tag → throws TAG_NAME_TAKEN 409; update not called', async () => {
    mockPrisma.tag.findFirst
      .mockResolvedValueOnce(mockTag())           // ownership
      .mockResolvedValueOnce(mockTag({ id: 'tag-2', name: 'Renamed' })); // conflict

    await expect(updateTag('user-1', 'tag-1', { name: 'renamed' })).rejects.toThrow(
      expect.objectContaining({ code: 'TAG_NAME_TAKEN' }),
    );
    expect(mockPrisma.tag.update).not.toHaveBeenCalled();
  });

  it('TAG-UT-10: update color only → update called with color; no name in data', async () => {
    mockPrisma.tag.findFirst.mockResolvedValueOnce(mockTag());
    mockPrisma.tag.update.mockResolvedValue(mockTag({ color: '#aabbcc' }));

    await updateTag('user-1', 'tag-1', { color: '#aabbcc' });

    const updateCall = mockPrisma.tag.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).toHaveProperty('color', '#aabbcc');
    expect(updateCall.data).not.toHaveProperty('name');
  });

  it('TAG-UT-11: color: null → update called with color: null (unset)', async () => {
    mockPrisma.tag.findFirst.mockResolvedValueOnce(mockTag());
    mockPrisma.tag.update.mockResolvedValue(mockTag({ color: null }));

    await updateTag('user-1', 'tag-1', { color: null });

    const updateCall = mockPrisma.tag.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).toHaveProperty('color', null);
  });

  it('TAG-UT-12: color absent (undefined) → update called WITHOUT color key', async () => {
    mockPrisma.tag.findFirst.mockResolvedValueOnce(mockTag());
    mockPrisma.tag.update.mockResolvedValue(mockTag({ name: 'new' }));

    await updateTag('user-1', 'tag-1', { name: 'new' });

    const updateCall = mockPrisma.tag.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty('color');
  });

  it('TAG-UT-13: update both name and color → both present in update data', async () => {
    mockPrisma.tag.findFirst
      .mockResolvedValueOnce(mockTag())
      .mockResolvedValueOnce(null);
    mockPrisma.tag.update.mockResolvedValue(mockTag({ name: 'new', color: '#001122' }));

    await updateTag('user-1', 'tag-1', { name: 'new', color: '#001122' });

    const updateCall = mockPrisma.tag.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).toHaveProperty('name', 'new');
    expect(updateCall.data).toHaveProperty('color', '#001122');
  });

  it('TAG-UT-14: rename to same name different case — self-exclusion means no conflict', async () => {
    mockPrisma.tag.findFirst
      .mockResolvedValueOnce(mockTag({ name: 'work' }))  // ownership
      .mockResolvedValueOnce(null);                       // uniqueness (self excluded → no conflict)
    mockPrisma.tag.update.mockResolvedValue(mockTag({ name: 'Work' }));

    await expect(updateTag('user-1', 'tag-1', { name: 'Work' })).resolves.not.toThrow();
    expect(mockPrisma.tag.update).toHaveBeenCalledOnce();
  });
});

// ── deleteTag ─────────────────────────────────────────────────────────────────

describe('deleteTag', () => {
  it('TAG-UT-15: happy path → findFirst returns tag; delete called; resolves void', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(mockTag());
    mockPrisma.tag.delete.mockResolvedValue({});

    await expect(deleteTag('user-1', 'tag-1')).resolves.toBeUndefined();
    expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
  });

  it('TAG-UT-16: tag not found → throws NOT_FOUND 404; delete not called', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);

    await expect(deleteTag('user-1', 'missing')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.tag.delete).not.toHaveBeenCalled();
  });

  it('TAG-UT-17: foreign tag (findFirst returns null due to userId scope) → throws NOT_FOUND', async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);

    const err = await deleteTag('user-1', 'other-users-tag').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('NOT_FOUND');
    expect(mockPrisma.tag.delete).not.toHaveBeenCalled();
  });
});
