import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useNotes, useCreateNote, useDeleteNote } from '../useNotes.js';
import type { NoteListItem, PaginationMeta } from 'shared';

vi.mock('../../lib/apiClient.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '../../lib/apiClient.js';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockDelete = vi.mocked(apiClient.delete);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockMeta: PaginationMeta = { total: 1, page: 1, limit: 20, totalPages: 1 };
const mockNote: NoteListItem = {
  id: 'note-1',
  title: 'Hello',
  contentPreview: 'world',
  tags: [],
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('useNotes', () => {
  it('NOTES-HOOK-01: returns notes list on success', async () => {
    mockGet.mockResolvedValue({ data: { data: [mockNote], meta: mockMeta } });
    const { result } = renderHook(
      () => useNotes({ page: 1, limit: 20, sortBy: 'updatedAt', sortOrder: 'desc' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.meta.total).toBe(1);
  });

  it('NOTES-HOOK-02: passes query params including tags', async () => {
    mockGet.mockResolvedValue({ data: { data: [], meta: { ...mockMeta, total: 0 } } });
    const params = { page: 2, limit: 20, sortBy: 'title' as const, sortOrder: 'asc' as const, tags: 'tag-1,tag-2' };
    const { result } = renderHook(() => useNotes(params), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/notes', { params });
  });
});

describe('useCreateNote', () => {
  it('NOTES-HOOK-03: calls POST /notes and returns note', async () => {
    const newNote = { id: 'note-2', title: 'Untitled', content: {}, tags: [], shareLinksCount: 0, createdAt: '', updatedAt: '' };
    mockPost.mockResolvedValue({ data: newNote });
    mockGet.mockResolvedValue({ data: { data: [], meta: mockMeta } });

    const { result } = renderHook(() => useCreateNote(), { wrapper: makeWrapper() });
    result.current.mutate({ title: 'Untitled' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/notes', { title: 'Untitled' });
    expect(result.current.data?.id).toBe('note-2');
  });
});

describe('useDeleteNote', () => {
  it('NOTES-HOOK-04: calls DELETE /notes/:id', async () => {
    mockDelete.mockResolvedValue({});
    mockGet.mockResolvedValue({ data: { data: [], meta: mockMeta } });

    const { result } = renderHook(() => useDeleteNote(), { wrapper: makeWrapper() });
    result.current.mutate('note-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/notes/note-1');
  });
});
