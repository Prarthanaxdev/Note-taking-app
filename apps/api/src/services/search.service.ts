import type { z } from 'zod';
import type { SearchResult, PaginationMeta } from 'shared';
import { SearchQuerySchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

type RawSearchRow = {
  id: string;
  title: string;
  updatedAt: Date;
  headline: string;
  rank: number;
  total_count: bigint;
};

export async function search(
  userId: string,
  dto: z.infer<typeof SearchQuerySchema>,
): Promise<{ data: SearchResult[]; meta: PaginationMeta }> {
  const { q, page, limit } = dto;
  if (!q) throw new AppError('QUERY_REQUIRED', 'Search query is required.', 400);

  const offset = (page - 1) * limit;

  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    SELECT
      n.id,
      n.title,
      n."updatedAt",
      ts_headline(
        'english',
        COALESCE(n."contentText", ''),
        plainto_tsquery('english', ${q}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'
      ) AS headline,
      ts_rank(n.ts, plainto_tsquery('english', ${q})) AS rank,
      COUNT(*) OVER() AS total_count
    FROM "Note" n
    WHERE
      n."userId" = ${userId}
      AND n."deletedAt" IS NULL
      AND n.ts @@ plainto_tsquery('english', ${q})
    ORDER BY rank DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    data: rows.map(row => ({
      id: row.id,
      title: row.title,
      headline: row.headline,
      updatedAt: row.updatedAt.toISOString(),
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
