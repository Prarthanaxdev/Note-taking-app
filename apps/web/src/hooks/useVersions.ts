import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VersionListItem, VersionDetail, NoteDetail } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function useVersionList(noteId: string) {
  return useQuery<VersionListItem[]>({
    queryKey: ['versions', noteId],
    queryFn: () =>
      apiClient.get<VersionListItem[]>(`/notes/${noteId}/versions`).then((r) => r.data),
  });
}

export function useVersionDetail(noteId: string, versionId: string | null) {
  return useQuery<VersionDetail>({
    queryKey: ['versions', noteId, versionId],
    queryFn: () =>
      apiClient
        .get<VersionDetail>(`/notes/${noteId}/versions/${versionId}`)
        .then((r) => r.data),
    enabled: versionId !== null,
  });
}

export function useRestoreVersion(noteId: string) {
  const qc = useQueryClient();
  return useMutation<NoteDetail, unknown, string>({
    mutationFn: (versionId) =>
      apiClient
        .post<NoteDetail>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', noteId] });
      qc.invalidateQueries({ queryKey: ['versions', noteId] });
    },
  });
}
