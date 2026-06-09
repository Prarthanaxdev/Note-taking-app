import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useVersionList, useVersionDetail, useRestoreVersion } from '../useVersions.js';
import type { VersionListItem, VersionDetail, NoteDetail } from 'shared';

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

const mockVersionList: VersionListItem[] = [
  { id: 'ver-1', savedAt: '2026-06-09T10:00:00Z' },
  { id: 'ver-2', savedAt: '2026-06-09T09:00:00Z' },
];

const mockVersionDetail: VersionDetail = {
  id: 'ver-2',
  title: 'My note',
  content: { type: 'doc', content: [] },
  savedAt: '2026-06-09T09:00:00Z',
};

const mockNoteDetail: NoteDetail = {
  id: 'note-1',
  title: 'My note',
  content: { type: 'doc', content: [] },
  tags: [],
  shareLinksCount: 0,
  createdAt: '2026-06-09T08:00:00Z',
  updatedAt: '2026-06-09T10:30:00Z',
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('useVersionList', () => {
  it('VER-HOOK-01: calls GET /notes/:id/versions and returns VersionListItem[]', async () => {
    mockGet.mockResolvedValue({ data: mockVersionList });
    const { result } = renderHook(() => useVersionList('note-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/notes/note-1/versions');
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].id).toBe('ver-1');
  });
});

describe('useVersionDetail', () => {
  it('VER-HOOK-02: calls GET /notes/:id/versions/:vid when versionId is non-null', async () => {
    mockGet.mockResolvedValue({ data: mockVersionDetail });
    const { result } = renderHook(() => useVersionDetail('note-1', 'ver-2'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/notes/note-1/versions/ver-2');
    expect(result.current.data?.title).toBe('My note');
  });

  it('VER-HOOK-03: does NOT fire when versionId is null', async () => {
    const { result } = renderHook(() => useVersionDetail('note-1', null), {
      wrapper: makeWrapper(),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useRestoreVersion', () => {
  it('VER-HOOK-04: calls POST .../restore and invalidates [notes, noteId]', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    mockPost.mockResolvedValue({ data: mockNoteDetail });
    mockGet.mockResolvedValue({ data: [] });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useRestoreVersion('note-1'), { wrapper });
    result.current.mutate('ver-2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/notes/note-1/versions/ver-2/restore');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notes', 'note-1'] });
  });

  it('VER-HOOK-05: also invalidates [versions, noteId] on success', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    mockPost.mockResolvedValue({ data: mockNoteDetail });
    mockGet.mockResolvedValue({ data: [] });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useRestoreVersion('note-1'), { wrapper });
    result.current.mutate('ver-2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['versions', 'note-1'] });
  });
});
