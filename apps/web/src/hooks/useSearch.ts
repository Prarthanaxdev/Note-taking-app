import { useQuery } from '@tanstack/react-query';
import type { SearchResult, PaginationMeta } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export interface SearchParams {
  q: string;
  page: number;
  limit: number;
}

export function useSearch(params: SearchParams) {
  return useQuery<{ data: SearchResult[]; meta: PaginationMeta }>({
    queryKey: ['search', params],
    queryFn: () =>
      apiClient
        .get<{ data: SearchResult[]; meta: PaginationMeta }>('/notes/search', { params })
        .then((r) => r.data),
    enabled: params.q.trim().length > 0,
  });
}
