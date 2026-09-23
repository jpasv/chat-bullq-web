'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareText, Loader2 } from 'lucide-react';
import { useOrgId } from '@/hooks/use-org-query-key';
import { channelsService } from '@/features/channels/services/channels.service';
import { useComments } from '../hooks/use-comments';
import { useCommentsSocket } from '../hooks/use-comments-socket';
import type { CommentsFilters as ApiFilters } from '../services/comments.service';
import { CommentsFilters, type CommentsFilterState } from './comments-filters';
import { CommentCard } from './comment-card';

function toApiFilters(state: CommentsFilterState): ApiFilters {
  const f: ApiFilters = {};
  if (state.channelId) f.channelId = state.channelId;
  if (state.view === 'unreplied') f.unreplied = true;
  if (state.view === 'hidden') f.status = 'HIDDEN';
  if (state.view === 'deleted') f.status = 'DELETED';
  return f;
}

export function CommentList() {
  const orgId = useOrgId();
  const [filters, setFilters] = useState<CommentsFilterState>({ channelId: '', view: 'all' });
  useCommentsSocket();

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
    staleTime: 60_000,
  });
  const igChannels = useMemo(() => channels.filter((c) => c.type === 'INSTAGRAM'), [channels]);

  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(apiFilters);
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Comentários</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Comentários públicos nos posts das contas Instagram conectadas.
      </p>

      <CommentsFilters channels={igChannels} value={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="mt-10 flex justify-center text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nenhum comentário por aqui.</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Se a conta acabou de ser conectada, confira se o token tem a permissão
            <code className="mx-1">instagram_business_manage_comments</code>
            e se o app Meta assina o webhook <code>comments</code>. Só comentários feitos depois disso aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((c) => (
            <CommentCard key={c.id} comment={c} />
          ))}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mx-auto block rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
