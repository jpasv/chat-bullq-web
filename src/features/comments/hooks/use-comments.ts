'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/use-org-query-key';
import { commentsService, type CommentsFilters } from '../services/comments.service';

export const COMMENTS_QUERY_KEY = 'social-comments';

export function useComments(filters: CommentsFilters) {
  const orgId = useOrgId();
  return useInfiniteQuery({
    queryKey: [COMMENTS_QUERY_KEY, orgId, filters],
    queryFn: ({ pageParam }) => commentsService.list(filters, pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!orgId,
  });
}
