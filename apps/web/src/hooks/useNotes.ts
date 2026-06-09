import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NoteListItem, NoteDetail, PaginationMeta } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export type SortBy = 'createdAt' | 'updatedAt' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface NoteListParams {
  page: number;
  limit: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
  tags?: string;
}

interface UpdateNoteInput {
  id: string;
  title?: string;
  content?: object | null;
  tagIds?: string[];
}

export function useNotes(params: NoteListParams) {
  return useQuery({
    queryKey: ['notes', params],
    queryFn: () =>
      apiClient
        .get<{ data: NoteListItem[]; meta: PaginationMeta }>('/notes', { params })
        .then((r) => r.data),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: ['notes', id],
    queryFn: () => apiClient.get<NoteDetail>(`/notes/${id}`).then((r) => r.data),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; content?: object | null; tagIds?: string[] }) =>
      apiClient.post<NoteDetail>('/notes', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateNoteInput) =>
      apiClient.patch<NoteDetail>(`/notes/${id}`, data).then((r) => r.data),
    onSuccess: (note) => {
      qc.setQueryData(['notes', note.id], note);
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
