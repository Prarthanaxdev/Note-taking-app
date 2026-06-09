import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useSearch } from '../useSearch.js';
import type { SearchResult, PaginationMeta } from 'shared';

vi.mock('../../lib/apiClient.js', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '../../lib/apiClient.js';
const mockGet = vi.mocked(apiClient.get);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockMeta: PaginationMeta = { total: 2, page: 1, limit: 20, totalPages: 1 };
const mockResults: SearchResult[] = [
  {
    id: 'note-1',
    title: 'React hooks',
    headline: 'Learn about <mark>React</mark> hooks',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'note-2',
    title: 'TypeScript tips',
    headline: 'Useful <mark>TypeScript</mark> patterns',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
});

describe('useSearch', () => {
  it('SRCH-HOOK-01: fires GET /notes/search with correct params when q is non-empty', async () => {
    mockGet.mockResolvedValue({ data: { data: mockResults, meta: mockMeta } });
    const { result } = renderHook(
      () => useSearch({ q: 'react', page: 1, limit: 20 }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/notes/search', {
      params: { q: 'react', page: 1, limit: 20 },
    });
    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.meta.total).toBe(2);
  });

  it('SRCH-HOOK-02: does not fire when q is empty string', async () => {
    const { result } = renderHook(
      () => useSearch({ q: '', page: 1, limit: 20 }),
      { wrapper: makeWrapper() }
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('SRCH-HOOK-03: does not fire when q is whitespace-only', async () => {
    const { result } = renderHook(
      () => useSearch({ q: '   ', page: 1, limit: 20 }),
      { wrapper: makeWrapper() }
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
