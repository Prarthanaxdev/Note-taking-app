import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useTags } from '../useTags.js';
import type { TagWithCount } from 'shared';

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

const mockTags: TagWithCount[] = [
  { id: 'tag-1', name: 'work', color: '#3b82f6', noteCount: 5 },
  { id: 'tag-2', name: 'personal', color: null, noteCount: 2 },
];

beforeEach(() => {
  mockGet.mockReset();
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
