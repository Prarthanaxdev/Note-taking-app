import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from '../useShares.js';
import type { ShareLink } from 'shared';

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

const mockLinks: ShareLink[] = [
  {
    id: 'share-1',
    noteId: 'note-1',
    userId: 'user-1',
    token: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    expiresAt: null,
    revokedAt: null,
    viewCount: 3,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('useShareLinks', () => {
  it('SHARE-HOOK-01: calls GET /notes/:id/shares and returns ShareLink[]', async () => {
    mockGet.mockResolvedValue({ data: mockLinks });
    const { result } = renderHook(() => useShareLinks('note-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/notes/note-1/shares');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].token).toBe('abc12345-def6-7890-ghij-klmnopqrstuv');
  });
});

describe('useCreateShareLink', () => {
  it('SHARE-HOOK-02: calls POST /notes/:id/share with no expiresAt for permanent link', async () => {
    const newLink: ShareLink = { ...mockLinks[0], id: 'share-2' };
    mockPost.mockResolvedValue({ data: newLink });
    mockGet.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useCreateShareLink('note-1'), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/notes/note-1/share', {});
    expect(result.current.data?.id).toBe('share-2');
  });

  it('SHARE-HOOK-03: passes expiresAt field when provided', async () => {
    const newLink: ShareLink = { ...mockLinks[0], expiresAt: '2026-12-31T23:59:59.000Z' };
    mockPost.mockResolvedValue({ data: newLink });
    mockGet.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useCreateShareLink('note-1'), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ expiresAt: '2026-12-31T23:59:59.000Z' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/notes/note-1/share', {
      expiresAt: '2026-12-31T23:59:59.000Z',
    });
  });

  it('SHARE-HOOK-04: invalidates [shares, noteId] on success', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const newLink: ShareLink = { ...mockLinks[0], id: 'share-3' };
    mockPost.mockResolvedValue({ data: newLink });
    mockGet.mockResolvedValue({ data: [] });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useCreateShareLink('note-1'), { wrapper });
    result.current.mutate({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shares', 'note-1'] });
  });
});

describe('useRevokeShareLink', () => {
  it('SHARE-HOOK-05: calls DELETE /shares/:shareId', async () => {
    mockDelete.mockResolvedValue({ status: 204 });
    mockGet.mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useRevokeShareLink('note-1'), {
      wrapper: makeWrapper(),
    });
    result.current.mutate('share-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/shares/share-1');
  });

  it('SHARE-HOOK-06: invalidates [shares, noteId] on success', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    mockDelete.mockResolvedValue({ status: 204 });
    mockGet.mockResolvedValue({ data: [] });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useRevokeShareLink('note-1'), { wrapper });
    result.current.mutate('share-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shares', 'note-1'] });
  });
});
