import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TagWithCount, TagSummary } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<TagWithCount[]>('/tags').then((r) => r.data),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiClient.post<TagSummary>('/tags', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}
