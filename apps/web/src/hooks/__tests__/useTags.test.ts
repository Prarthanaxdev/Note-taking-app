import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useTags, useCreateTag } from '../useTags.js';
import type { TagWithCount, TagSummary } from 'shared';

vi.mock('../../lib/apiClient.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '../../lib/apiClient.js';
const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockTags: TagWithCount[] = [
  { id: 'tag-1', name: 'work', color: '#3b82f6', noteCount: 5 },
  { id: 'tag-2', name: 'personal', color: null, noteCount: 2 },
];

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('useTags', () => {
  it('TAGS-HOOK-01: returns tags list on success', async () => {
    mockGet.mockResolvedValue({ data: mockTags });
    const { result } = renderHook(() => useTags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe('work');
  });

  it('TAGS-HOOK-02: calls GET /tags', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useTags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/tags');
  });
});

describe('useCreateTag', () => {
  it('TAG-HOOK-02: calls POST /tags and returns created tag', async () => {
    const newTag: TagSummary = { id: 'tag-3', name: 'ideas', color: null };
    mockPost.mockResolvedValue({ data: newTag });
    mockGet.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useCreateTag(), { wrapper: makeWrapper() });
    result.current.mutate({ name: 'ideas' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/tags', { name: 'ideas' });
    expect(result.current.data?.name).toBe('ideas');
  });

  it('TAG-HOOK-03: invalidates [tags] query after create', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const newTag: TagSummary = { id: 'tag-4', name: 'work', color: '#3b82f6' };
    mockPost.mockResolvedValue({ data: newTag });
    mockGet.mockResolvedValue({ data: [] });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useCreateTag(), { wrapper });
    result.current.mutate({ name: 'work' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags'] });
  });
});
