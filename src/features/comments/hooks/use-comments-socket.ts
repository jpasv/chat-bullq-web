'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/features/inbox/hooks/use-socket';
import { COMMENTS_QUERY_KEY } from './use-comments';

/** Invalida a lista quando o backend emite eventos de comentário no canal. */
export function useCommentsSocket() {
  const { on, onReconnect } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: [COMMENTS_QUERY_KEY] });
    const offNew = on('comment:new', invalidate);
    const offUpdated = on('comment:updated', invalidate);
    const offReconnect = onReconnect(invalidate);
    return () => {
      offNew();
      offUpdated();
      offReconnect();
    };
  }, [on, onReconnect, queryClient]);
}
