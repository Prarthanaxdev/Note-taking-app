import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    note: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    tag: {
      findMany: vi.fn(),
    },
    noteTag: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    noteVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fnOrOps: unknown) => {
      if (Array.isArray(fnOrOps)) {
        return Promise.all(fnOrOps as Promise<unknown>[]);
      }
      return (fnOrOps as (tx: unknown) => Promise<unknown>)({
        note: { update: vi.fn() },
        noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
        noteVersion: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      });
    }),
  },
}));

import { prisma } from '../../lib/prisma.js';
import { create, getById, update, softDelete, list } from '../notes.service.js';

type MockPrisma = {
  note: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  tag: { findMany: ReturnType<typeof vi.fn> };
  noteTag: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  noteVersion: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockPrisma = prisma as unknown as MockPrisma;

// Minimal note shape returned by note.create / note.findFirst (with includes)
function mockNoteWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    title: 'My Note',
    content: null,
    contentText: '',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    tags: [],
    _count: { shareLinks: 0 },
    ...overrides,
  };
}

// Minimal note shape from findFirst WITHOUT includes (used for ownership/existence check)
function mockCurrentNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    title: 'Old Title',
    content: { type: 'doc', content: [] },
    contentText: 'old text',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ── create ─────────────────────────────────────────────────────────────────────

describe('create', () => {
  it('NOTE-UT-01: happy path no tags — calls note.create and returns NoteDetail with shareLinksCount 0', async () => {
    mockPrisma.note.create.mockResolvedValue(mockNoteWithRelations({ title: 'Test' }));

    const result = await create('user-1', { title: 'Test' });

    expect(mockPrisma.note.create).toHaveBeenCalledOnce();
    expect(result.shareLinksCount).toBe(0);
    expect(result.tags).toEqual([]);
    expect(result.title).toBe('Test');
  });

  it('NOTE-UT-02: happy path with owned tags — validates then creates with nested tag create', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);
    mockPrisma.note.create.mockResolvedValue(
      mockNoteWithRelations({
        tags: [
          { tagId: 'tag-1', noteId: 'note-1', tag: { id: 'tag-1', name: 'work', color: '#ff0000' } },
          { tagId: 'tag-2', noteId: 'note-1', tag: { id: 'tag-2', name: 'personal', color: null } },
        ],
      }),
    );

    const result = await create('user-1', { title: 'Test', tagIds: ['tag-1', 'tag-2'] });

    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['tag-1', 'tag-2'] }, userId: 'user-1' } }),
    );
    expect(result.tags).toHaveLength(2);
  });

  it('NOTE-UT-03: tagIds.length > 5 → throws TOO_MANY_TAGS; note.create not called', async () => {
    await expect(
      create('user-1', { title: 'Test', tagIds: ['t1', 't2', 't3', 't4', 't5', 't6'] }),
    ).rejects.toThrow(expect.objectContaining({ code: 'TOO_MANY_TAGS', statusCode: 400 }));

    expect(mockPrisma.note.create).not.toHaveBeenCalled();
  });

  it('NOTE-UT-04: foreign tag → findMany returns fewer than tagIds.length → throws INVALID_TAG', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }]); // only 1 of 2

    await expect(
      create('user-1', { title: 'Test', tagIds: ['tag-1', 'tag-foreign'] }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_TAG', statusCode: 400 }));

    expect(mockPrisma.note.create).not.toHaveBeenCalled();
  });

  it('NOTE-UT-05: content provided → note.create called with non-empty contentText', async () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] };
    mockPrisma.note.create.mockResolvedValue(mockNoteWithRelations({ content, contentText: 'Hello world' }));

    await create('user-1', { title: 'Test', content });

    const createCall = mockPrisma.note.create.mock.calls[0][0] as { data: { contentText: string } };
    expect(createCall.data.contentText).toBe('Hello world');
  });

  it('NOTE-UT-06: content undefined → note.create called with contentText empty string', async () => {
    mockPrisma.note.create.mockResolvedValue(mockNoteWithRelations());

    await create('user-1', { title: 'Test' });

    const createCall = mockPrisma.note.create.mock.calls[0][0] as { data: { contentText: string } };
    expect(createCall.data.contentText).toBe('');
  });
});

// ── getById ────────────────────────────────────────────────────────────────────

describe('getById', () => {
  it('NOTE-UT-07: note found → returns NoteDetail', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(mockNoteWithRelations({ title: 'Found' }));

    const result = await getById('user-1', 'note-1');

    expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'note-1', userId: 'user-1', deletedAt: null } }),
    );
    expect(result.title).toBe('Found');
  });

  it('NOTE-UT-08: findFirst returns null (note not found) → throws NOT_FOUND 404', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(getById('user-1', 'missing')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
  });

  it('NOTE-UT-09: findFirst returns null (deleted or foreign) → throws NOT_FOUND 404', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    const err = await getById('user-1', 'other-user-note').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(404);
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('update', () => {
  it('NOTE-UT-10: note not found → throws NOT_FOUND; $transaction not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(update('user-1', 'note-1', { title: 'New' })).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('NOTE-UT-11: title update → $transaction called; noteVersion.create receives OLD title', async () => {
    const current = mockCurrentNote({ title: 'Old Title', content: null });
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(mockNoteWithRelations({ title: 'New Title' }));

    const txCreate = vi.fn().mockResolvedValue({});
    const txNoteUpdate = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: txCreate, findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          note: { update: txNoteUpdate },
        }),
    );

    await update('user-1', 'note-1', { title: 'New Title' });

    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Old Title' }) }),
    );
  });

  it('NOTE-UT-12: content update → note.update called with new content and new contentText', async () => {
    const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'updated' }] }] };
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations({ contentText: 'updated' }));

    let capturedData: Record<string, unknown> | undefined;
    const txNoteUpdate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      capturedData = args.data;
      return Promise.resolve({});
    });
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          note: { update: txNoteUpdate },
        }),
    );

    await update('user-1', 'note-1', { content: newContent });

    expect(capturedData?.contentText).toBe('updated');
  });

  it('NOTE-UT-13: tagIds undefined → noteTag.deleteMany and createMany NOT called', async () => {
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations());

    const txNoteTagDeleteMany = vi.fn();
    const txNoteTagCreateMany = vi.fn();
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: txNoteTagDeleteMany, createMany: txNoteTagCreateMany },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { title: 'New' });

    expect(txNoteTagDeleteMany).not.toHaveBeenCalled();
    expect(txNoteTagCreateMany).not.toHaveBeenCalled();
  });

  it('NOTE-UT-14: tagIds: [] → noteTag.deleteMany called; createMany NOT called', async () => {
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations({ tags: [] }));

    const txDeleteMany = vi.fn().mockResolvedValue({});
    const txCreateMany = vi.fn();
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: txDeleteMany, createMany: txCreateMany },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { tagIds: [] });

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { noteId: 'note-1' } });
    expect(txCreateMany).not.toHaveBeenCalled();
  });

  it('NOTE-UT-15: tagIds: [id1] → noteTag.deleteMany then createMany with correct data', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }]);
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations());

    const txDeleteMany = vi.fn().mockResolvedValue({});
    const txCreateMany = vi.fn().mockResolvedValue({});
    const callOrder: string[] = [];
    txDeleteMany.mockImplementation(() => { callOrder.push('delete'); return Promise.resolve({}); });
    txCreateMany.mockImplementation(() => { callOrder.push('create'); return Promise.resolve({}); });

    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: txDeleteMany, createMany: txCreateMany },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { tagIds: ['tag-1'] });

    expect(callOrder[0]).toBe('delete');
    expect(callOrder[1]).toBe('create');
    expect(txCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ noteId: 'note-1', tagId: 'tag-1' }] }),
    );
  });

  it('NOTE-UT-16: foreign tag in tagIds → throws INVALID_TAG; $transaction not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValueOnce(mockCurrentNote());
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }]); // only 1 of 2

    await expect(update('user-1', 'note-1', { tagIds: ['tag-1', 'tag-foreign'] })).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_TAG' }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('NOTE-UT-17: snapshot created with PRE-UPDATE title and content', async () => {
    const current = mockCurrentNote({ title: 'Before', content: { type: 'doc', content: [] } });
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(mockNoteWithRelations({ title: 'After' }));

    let snapshotData: Record<string, unknown> | undefined;
    const txCreate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      snapshotData = args.data;
      return Promise.resolve({});
    });
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: { create: txCreate, findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { title: 'After' });

    expect(snapshotData?.title).toBe('Before');
  });

  it('NOTE-UT-18: 51 versions after snapshot → deleteMany called with 1 oldest id', async () => {
    const versions = Array.from({ length: 51 }, (_, i) => ({ id: `v${i}` }));
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations());

    const txDeleteMany = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: {
            create: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue(versions),
            deleteMany: txDeleteMany,
          },
          noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { title: 'New' });

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['v0'] } } });
  });

  it('NOTE-UT-19: exactly 50 versions → deleteMany NOT called', async () => {
    const versions = Array.from({ length: 50 }, (_, i) => ({ id: `v${i}` }));
    mockPrisma.note.findFirst
      .mockResolvedValueOnce(mockCurrentNote())
      .mockResolvedValueOnce(mockNoteWithRelations());

    const txDeleteMany = vi.fn();
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          noteVersion: {
            create: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue(versions),
            deleteMany: txDeleteMany,
          },
          noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          note: { update: vi.fn().mockResolvedValue({}) },
        }),
    );

    await update('user-1', 'note-1', { title: 'New' });

    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('NOTE-UT-20: title whitespace string → throws TITLE_REQUIRED', async () => {
    mockPrisma.note.findFirst.mockResolvedValueOnce(mockCurrentNote());

    await expect(update('user-1', 'note-1', { title: '   ' })).rejects.toThrow(
      expect.objectContaining({ code: 'TITLE_REQUIRED', statusCode: 400 }),
    );
  });
});

// ── softDelete ─────────────────────────────────────────────────────────────────

describe('softDelete', () => {
  it('NOTE-UT-21: happy path → note.update called with deletedAt Date; resolves void', async () => {
    mockPrisma.note.findFirst.mockResolvedValue({ id: 'note-1' });
    mockPrisma.note.update.mockResolvedValue({});

    await expect(softDelete('user-1', 'note-1')).resolves.toBeUndefined();
    expect(mockPrisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'note-1' },
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });

  it('NOTE-UT-22: findFirst returns null (note not found) → throws NOT_FOUND; note.update not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(softDelete('user-1', 'missing')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
    );
    expect(mockPrisma.note.update).not.toHaveBeenCalled();
  });

  it('NOTE-UT-23: findFirst returns null (already deleted) → throws NOT_FOUND; note.update not called', async () => {
    mockPrisma.note.findFirst.mockResolvedValue(null);

    const err = await softDelete('user-1', 'deleted-note').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('NOT_FOUND');
    expect(mockPrisma.note.update).not.toHaveBeenCalled();
  });
});

// ── list ───────────────────────────────────────────────────────────────────────

const DEFAULT_QUERY = {
  page: 1,
  limit: 20,
  sortBy: 'updatedAt' as const,
  sortOrder: 'desc' as const,
  tags: undefined,
};

function mockNoteListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'My Note',
    contentText: 'some content',
    updatedAt: new Date('2026-01-01'),
    tags: [],
    ...overrides,
  };
}

describe('list', () => {
  it('LIST-UT-01: happy path — no tags, default pagination → returns { data, meta }', async () => {
    mockPrisma.note.count.mockResolvedValue(1);
    mockPrisma.note.findMany.mockResolvedValue([mockNoteListRow()]);

    const result = await list('user-1', DEFAULT_QUERY);

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('LIST-UT-02: valid tags CSV → tag.findMany called for validation; findMany where includes AND', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);
    mockPrisma.note.count.mockResolvedValue(0);
    mockPrisma.note.findMany.mockResolvedValue([]);

    await list('user-1', { ...DEFAULT_QUERY, tags: 'tag-1,tag-2' });

    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['tag-1', 'tag-2'] }, userId: 'user-1' } }),
    );
    const findManyCall = mockPrisma.note.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findManyCall.where).toHaveProperty('AND');
  });

  it('LIST-UT-03: foreign tag in CSV → throws INVALID_TAG', async () => {
    mockPrisma.tag.findMany.mockResolvedValue([]);

    await expect(list('user-1', { ...DEFAULT_QUERY, tags: 'tag-foreign' })).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_TAG', statusCode: 400 }),
    );
  });

  it('LIST-UT-04: contentText null → contentPreview is empty string', async () => {
    mockPrisma.note.count.mockResolvedValue(1);
    mockPrisma.note.findMany.mockResolvedValue([mockNoteListRow({ contentText: null })]);

    const result = await list('user-1', DEFAULT_QUERY);

    expect(result.data[0].contentPreview).toBe('');
  });

  it('LIST-UT-05: contentText longer than 150 chars → contentPreview hard-cut at 150', async () => {
    mockPrisma.note.count.mockResolvedValue(1);
    mockPrisma.note.findMany.mockResolvedValue([mockNoteListRow({ contentText: 'x'.repeat(200) })]);

    const result = await list('user-1', DEFAULT_QUERY);

    expect(result.data[0].contentPreview).toHaveLength(150);
    expect(result.data[0].contentPreview).toBe('x'.repeat(150));
  });

  it('LIST-UT-06: sortBy title asc → note.findMany called with orderBy { title: asc }', async () => {
    mockPrisma.note.count.mockResolvedValue(0);
    mockPrisma.note.findMany.mockResolvedValue([]);

    await list('user-1', { ...DEFAULT_QUERY, sortBy: 'title', sortOrder: 'asc' });

    const findManyCall = mockPrisma.note.findMany.mock.calls[0][0] as { orderBy: Record<string, unknown> };
    expect(findManyCall.orderBy).toEqual({ title: 'asc' });
  });

  it('LIST-UT-07: page=2, limit=5 → note.findMany called with skip=5, take=5', async () => {
    mockPrisma.note.count.mockResolvedValue(10);
    mockPrisma.note.findMany.mockResolvedValue([]);

    await list('user-1', { ...DEFAULT_QUERY, page: 2, limit: 5 });

    const findManyCall = mockPrisma.note.findMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findManyCall.skip).toBe(5);
    expect(findManyCall.take).toBe(5);
  });

  it('LIST-UT-08: total=0 → meta.totalPages=0, data=[]', async () => {
    mockPrisma.note.count.mockResolvedValue(0);
    mockPrisma.note.findMany.mockResolvedValue([]);

    const result = await list('user-1', DEFAULT_QUERY);

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });

  it('LIST-UT-09: no tags param → tag.findMany NOT called; where has no AND key', async () => {
    mockPrisma.note.count.mockResolvedValue(0);
    mockPrisma.note.findMany.mockResolvedValue([]);

    await list('user-1', DEFAULT_QUERY);

    expect(mockPrisma.tag.findMany).not.toHaveBeenCalled();
    const findManyCall = mockPrisma.note.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findManyCall.where).not.toHaveProperty('AND');
  });
});
