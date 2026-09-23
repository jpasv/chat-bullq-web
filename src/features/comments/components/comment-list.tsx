'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { MessageSquareText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgId } from '@/hooks/use-org-query-key';
import { useAuthStore } from '@/stores/auth-store';
import { channelsService } from '@/features/channels/services/channels.service';
import { useComments, COMMENTS_QUERY_KEY } from '../hooks/use-comments';
import { useCommentsSocket } from '../hooks/use-comments-socket';
import {
  commentsService,
  type CommentsFilters as ApiFilters,
  type CommentsPage,
  type SocialComment,
  type SocialCommentStatus,
} from '../services/comments.service';
import { CommentsFilters, type CommentsFilterState } from './comments-filters';
import { CommentCard } from './comment-card';
import { CommentReplyBox } from './comment-reply-box';
import { PrivateReplyDialog } from './private-reply-dialog';

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
  const [dmTarget, setDmTarget] = useState<SocialComment | null>(null);
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

  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.organizations.find((o) => o.id === s.activeOrgId)?.role);
  const canDelete = role === 'OWNER' || role === 'ADMIN';
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [COMMENTS_QUERY_KEY] });

  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => commentsService.reply(id, text),
    onSuccess: () => { toast.success('Resposta publicada'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const hideMutation = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => commentsService.hide(id, hidden),
    onMutate: async ({ id, hidden }) => {
      await queryClient.cancelQueries({ queryKey: [COMMENTS_QUERY_KEY] });
      const snapshots = queryClient.getQueriesData<InfiniteData<CommentsPage>>({ queryKey: [COMMENTS_QUERY_KEY] });
      const status: SocialCommentStatus = hidden ? 'HIDDEN' : 'VISIBLE';
      const patch = (c: SocialComment): SocialComment =>
        c.id === id ? { ...c, status } : { ...c, replies: c.replies.map((r) => (r.id === id ? { ...r, status } : r)) };
      queryClient.setQueriesData<InfiniteData<CommentsPage>>({ queryKey: [COMMENTS_QUERY_KEY] }, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map(patch) })) } : old,
      );
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (_d, v) => toast.success(v.hidden ? 'Comentário oculto' : 'Comentário visível'),
    onSettled: () => invalidate(),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => commentsService.remove(id),
    onSuccess: () => { toast.success('Comentário deletado'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const busyIds = new Set<string>();
  if (replyMutation.isPending && replyMutation.variables) busyIds.add(replyMutation.variables.id);
  if (hideMutation.isPending && hideMutation.variables) busyIds.add(hideMutation.variables.id);
  if (deleteMutation.isPending && deleteMutation.variables) busyIds.add(deleteMutation.variables);

  return (
    <div className="h-full min-h-0 overflow-y-auto">
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
            <CommentCard
              key={c.id}
              comment={c}
              busy={busyIds.has(c.id)}
              canDelete={canDelete}
              onHide={(hidden) => hideMutation.mutate({ id: c.id, hidden })}
              onDelete={() => deleteMutation.mutate(c.id)}
              onOpenDm={() => setDmTarget(c)}
            >
              <CommentReplyBox
                onReply={(text) => replyMutation.mutateAsync({ id: c.id, text }).then(() => undefined)}
                onSuggest={() => commentsService.suggest(c.id)}
              />
            </CommentCard>
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

      <PrivateReplyDialog open={!!dmTarget} comment={dmTarget} onClose={() => setDmTarget(null)} />
    </div>
    </div>
  );
}
