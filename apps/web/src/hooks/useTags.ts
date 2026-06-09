import { useQuery } from '@tanstack/react-query';
import type { TagWithCount } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<TagWithCount[]>('/tags').then((r) => r.data),
  });
}
