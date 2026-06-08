import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '../../lib/prisma.js';
import { search } from '../search.service.js';

type MockPrisma = {
  $queryRaw: ReturnType<typeof vi.fn>;
};

const mockPrisma = prisma as unknown as MockPrisma;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'PostgreSQL guide',
    updatedAt: new Date('2024-06-01T00:00:00.000Z'),
    headline: 'A guide to <mark>PostgreSQL</mark> indexing',
    rank: 0.5,
    total_count: BigInt(1),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('search', () => {
  it('SRCH-UT-01: empty q throws QUERY_REQUIRED; $queryRaw not called', async () => {
    await expect(
      search('user-1', { q: '', page: 1, limit: 20 }),
    ).rejects.toThrow(expect.objectContaining({ code: 'QUERY_REQUIRED', statusCode: 400 }));

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('SRCH-UT-01b: empty q throws AppError instance', async () => {
    const err = await search('user-1', { q: '', page: 1, limit: 20 }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
  });

  it('SRCH-UT-02: $queryRaw returns [] → zero-result response', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await search('user-1', { q: 'typescript', page: 1, limit: 20 });

    expect(result).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it('SRCH-UT-03: two rows map to correct SearchResult shapes', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      makeRow({ id: 'note-1', title: 'First', total_count: BigInt(2) }),
      makeRow({ id: 'note-2', title: 'Second', total_count: BigInt(2) }),
    ]);

    const result = await search('user-1', { q: 'postgresql', page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ id: 'note-1', title: 'First' });
    expect(result.data[1]).toMatchObject({ id: 'note-2', title: 'Second' });
    expect(typeof result.data[0].updatedAt).toBe('string');
    expect(result.data[0].updatedAt).toBe('2024-06-01T00:00:00.000Z');
    expect(typeof result.meta.total).toBe('number');
    expect(result.meta.total).toBe(2);
  });

  it('SRCH-UT-04: page=2, limit=5 → correct meta and $queryRaw called', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await search('user-1', { q: 'test', page: 2, limit: 5 });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(5);
  });

  it('SRCH-UT-05: total_count BigInt(7) with 3 rows → meta.total=7, totalPages=1', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      makeRow({ total_count: BigInt(7) }),
      makeRow({ total_count: BigInt(7) }),
      makeRow({ total_count: BigInt(7) }),
    ]);

    const result = await search('user-1', { q: 'guide', page: 1, limit: 20 });

    expect(result.meta.total).toBe(7);
    expect(result.meta.totalPages).toBe(1);
    expect(result.data).toHaveLength(3);
  });

  it('SRCH-UT-06: valid query reaches $queryRaw exactly once', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await search('user-1', { q: 'hello', page: 1, limit: 20 });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
