'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/use-org-query-key';
import { commentsService } from '../services/comments.service';

export const COMMENT_MEDIA_QUERY_KEY = 'social-comment-media';

/** Posts com comentários (coluna da esquerda), já com contagens. */
export function useCommentMedia(channelId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [COMMENT_MEDIA_QUERY_KEY, orgId, channelId ?? ''],
    queryFn: () => commentsService.listMedia(channelId || undefined),
    enabled: !!orgId,
    staleTime: 15_000,
  });
}
