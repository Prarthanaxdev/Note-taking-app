import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShareLink } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function useShareLinks(noteId: string) {
  return useQuery<ShareLink[]>({
    queryKey: ['shares', noteId],
    queryFn: () => apiClient.get<ShareLink[]>(`/notes/${noteId}/shares`).then((r) => r.data),
  });
}

export function useCreateShareLink(noteId: string) {
  const qc = useQueryClient();
  return useMutation<ShareLink, unknown, { expiresAt?: string }>({
    mutationFn: (body) =>
      apiClient.post<ShareLink>(`/notes/${noteId}/share`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', noteId] }),
  });
}

export function useRevokeShareLink(noteId: string) {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (shareId) => apiClient.delete(`/shares/${shareId}`).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', noteId] }),
  });
}
