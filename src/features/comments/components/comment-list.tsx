'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useOrgId } from '@/hooks/use-org-query-key';
import { useAuthStore } from '@/stores/auth-store';
import { channelsService } from '@/features/channels/services/channels.service';
import { useComments, COMMENTS_QUERY_KEY } from '../hooks/use-comments';
import { useCommentMedia, COMMENT_MEDIA_QUERY_KEY } from '../hooks/use-comment-media';
import { useCommentsSocket } from '../hooks/use-comments-socket';
import {
  commentsService,
  type CommentsFilters as ApiFilters,
  type CommentsPage,
  type SocialComment,
  type SocialCommentStatus,
  type SocialMediaSummary,
} from '../services/comments.service';
import { CommentsToolbar, type CommentsToolbarState } from './comments-filters';
import { PostList, postKey } from './post-list';
import { CommentCard } from './comment-card';
import { CommentReplyBox } from './comment-reply-box';
import { PrivateReplyDialog } from './private-reply-dialog';

function toApiFilters(post: SocialMediaSummary | null, view: CommentsToolbarState['view']): ApiFilters {
  const f: ApiFilters = {};
  if (post) {
    f.channelId = post.channelId;
    f.mediaId = post.mediaId;
  }
  if (view === 'unreplied') f.unreplied = true;
  if (view === 'hidden') f.status = 'HIDDEN';
  if (view === 'deleted') f.status = 'DELETED';
  return f;
}

const isUnreplied = (c: SocialComment) => !c.repliedAt && !c.isFromPage && c.status === 'VISIBLE';

/** Busca e ordenação no cliente: a lista é sempre de um post só. */
function applyToolbar(items: SocialComment[], t: CommentsToolbarState): SocialComment[] {
  const q = t.search.trim().toLowerCase().replace(/^@/, '');
  let out = items;
  if (q) {
    out = out.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        (c.authorUsername ?? '').toLowerCase().includes(q) ||
        c.replies.some((r) => r.text.toLowerCase().includes(q) || (r.authorUsername ?? '').toLowerCase().includes(q)),
    );
  }
  const byTime = (a: SocialComment, b: SocialComment) =>
    new Date(b.commentedAt).getTime() - new Date(a.commentedAt).getTime();
  out = [...out];
  if (t.sort === 'newest') out.sort(byTime);
  if (t.sort === 'oldest') out.sort((a, b) => -byTime(a, b));
  if (t.sort === 'unreplied_first') {
    out.sort((a, b) => Number(isUnreplied(b)) - Number(isUnreplied(a)) || byTime(a, b));
  }
  return out;
}

function PostHeader({ post }: { post: SocialMediaSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {!post.mediaThumbnailUrl || broken ? (
          <ImageOff className="h-5 w-5 text-zinc-400" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.mediaThumbnailUrl} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-200">
          {post.mediaCaption?.trim() || 'Post sem legenda'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            <span className={cn('font-semibold', post.unreplied > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300')}>
              {post.unreplied}
            </span>{' '}
            sem resposta · <span className="font-semibold text-zinc-700 dark:text-zinc-300">{post.total}</span> total
          </span>
          {post.mediaPermalink && (
            <a
              href={post.mediaPermalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              Ver post <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentList() {
  const orgId = useOrgId();
  const [channelId, setChannelId] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<CommentsToolbarState>({ view: 'unreplied', sort: 'newest', search: '' });
  const [mobilePane, setMobilePane] = useState<'posts' | 'comments'>('posts');
  const [dmTarget, setDmTarget] = useState<SocialComment | null>(null);
  useCommentsSocket();

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
    staleTime: 60_000,
  });
  const igChannels = useMemo(() => channels.filter((c) => c.type === 'INSTAGRAM'), [channels]);

  const { data: posts = [], isLoading: postsLoading } = useCommentMedia(channelId || undefined);
  const selectedPost = useMemo(
    () => posts.find((p) => postKey(p) === selectedKey) ?? null,
    [posts, selectedKey],
  );

  // Seleciona o primeiro post quando nada está selecionado ou o selecionado sumiu.
  useEffect(() => {
    if (posts.length === 0) return;
    if (!selectedKey || !posts.some((p) => postKey(p) === selectedKey)) {
      setSelectedKey(postKey(posts[0]));
    }
  }, [posts, selectedKey]);

  const apiFilters = useMemo(() => toApiFilters(selectedPost, toolbar.view), [selectedPost, toolbar.view]);
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(apiFilters, !!selectedPost);
  const items = useMemo(
    () => applyToolbar(data?.pages.flatMap((p) => p.items) ?? [], toolbar),
    [data, toolbar],
  );

  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.organizations.find((o) => o.id === s.activeOrgId)?.role);
  const canDelete = role === 'OWNER' || role === 'ADMIN';
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [COMMENTS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [COMMENT_MEDIA_QUERY_KEY] });
  };

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

  const selectPost = (p: SocialMediaSummary) => {
    setSelectedKey(postKey(p));
    setMobilePane('comments');
  };

  const emptyMessage =
    toolbar.search.trim()
      ? 'Nada encontrado para essa busca.'
      : toolbar.view === 'unreplied'
        ? 'Tudo respondido neste post.'
        : 'Nenhum comentário neste filtro.';

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[320px_1fr]">
      <aside
        className={cn(
          'min-h-0 border-r border-zinc-200 dark:border-zinc-800',
          mobilePane === 'comments' && 'max-lg:hidden',
        )}
      >
        <PostList
          posts={posts}
          loading={postsLoading}
          selectedKey={selectedKey}
          onSelect={selectPost}
          channels={igChannels}
          channelId={channelId}
          onChannelChange={(id) => { setChannelId(id); setSelectedKey(null); }}
        />
      </aside>

      <section className={cn('flex min-h-0 flex-col', mobilePane === 'posts' && 'max-lg:hidden')}>
        {selectedPost ? (
          <>
            <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setMobilePane('posts')}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-primary lg:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Posts
              </button>
              <PostHeader post={selectedPost} />
              <CommentsToolbar value={toolbar} onChange={setToolbar} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="mt-6 flex justify-center text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
              ) : (
                <div className="mx-auto max-w-3xl space-y-2">
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
                      type="button"
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
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-500 dark:text-zinc-400">
            {postsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Escolha um post à esquerda.'}
          </div>
        )}
      </section>

      <PrivateReplyDialog open={!!dmTarget} comment={dmTarget} onClose={() => setDmTarget(null)} />
    </div>
  );
}
