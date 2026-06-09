import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useNotes, useNote, useCreateNote, useUpdateNote, useDeleteNote } from '../useNotes.js';
import type { NoteListItem, NoteDetail, PaginationMeta } from 'shared';

vi.mock('../../lib/apiClient.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '../../lib/apiClient.js';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockMeta: PaginationMeta = { total: 1, page: 1, limit: 20, totalPages: 1 };
const mockNoteDetail: NoteDetail = {
  id: 'note-1',
  title: 'Hello',
  content: { type: 'doc', content: [] },
  tags: [],
  shareLinksCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};
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
  mockPatch.mockReset();
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
    const newNote: NoteDetail = { id: 'note-2', title: 'Untitled', content: {}, tags: [], shareLinksCount: 0, createdAt: '', updatedAt: '' };
    mockPost.mockResolvedValue({ data: newNote });
    mockGet.mockResolvedValue({ data: { data: [], meta: mockMeta } });

    const { result } = renderHook(() => useCreateNote(), { wrapper: makeWrapper() });
    result.current.mutate({ title: 'Untitled' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/notes', { title: 'Untitled' });
    expect(result.current.data?.id).toBe('note-2');
  });
});

describe('useNote', () => {
  it('NOTE-HOOK-02: returns single note by id on success', async () => {
    mockGet.mockResolvedValue({ data: mockNoteDetail });
    const { result } = renderHook(() => useNote('note-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('note-1');
    expect(mockGet).toHaveBeenCalledWith('/notes/note-1');
  });

  it('NOTE-HOOK-02b: enters error state on 404', async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => useNote('missing'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateNote', () => {
  it('NOTE-HOOK-04: calls PATCH /notes/:id with payload', async () => {
    mockPatch.mockResolvedValue({ data: { ...mockNoteDetail, title: 'Updated' } });
    const { result } = renderHook(() => useUpdateNote(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 'note-1', title: 'Updated', tagIds: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/notes/note-1', { title: 'Updated', tagIds: [] });
    expect(result.current.data?.title).toBe('Updated');
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
