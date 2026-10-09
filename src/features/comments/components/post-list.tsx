'use client';

import { useState } from 'react';
import { ImageOff, Loader2, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel } from '@/features/channels/services/channels.service';
import type { SocialMediaSummary } from '../services/comments.service';
import { relativeTime } from './comment-card';

export const postKey = (p: { channelId: string; mediaId: string }) => `${p.channelId}:${p.mediaId}`;

const controlCls =
  'h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

function PostThumb({ url, caption }: { url: string | null; caption: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
      title={caption ?? 'Post'}
    >
      {!url || broken ? (
        <ImageOff className="h-4 w-4 text-zinc-400" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      )}
    </div>
  );
}

interface Props {
  posts: SocialMediaSummary[];
  loading: boolean;
  selectedKey: string | null;
  onSelect: (post: SocialMediaSummary) => void;
  channels: Channel[];
  channelId: string;
  onChannelChange: (channelId: string) => void;
}

/** Coluna da esquerda: posts com comentários, do mais recente pro mais antigo. */
export function PostList({ posts, loading, selectedKey, onSelect, channels, channelId, onChannelChange }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Comentários</h1>
        </div>
        {channels.length > 1 && (
          <select
            aria-label="Conta do Instagram"
            className={cn(controlCls, 'mt-3')}
            value={channelId}
            onChange={(e) => onChannelChange(e.target.value)}
          >
            <option value="">Todas as contas</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-6 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="p-4 text-xs text-zinc-500 dark:text-zinc-400">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nenhum post com comentários.</p>
            <p className="mt-2">
              Se a conta acabou de ser conectada, confira se o token tem a permissão
              <code className="mx-1">instagram_business_manage_comments</code>
              e se o app Meta assina o webhook <code>comments</code>. Só comentários feitos depois disso aparecem aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {posts.map((p) => {
              const key = postKey(p);
              const selected = key === selectedKey;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
                      selected && 'bg-primary/5 dark:bg-primary/10',
                    )}
                  >
                    <PostThumb url={p.mediaThumbnailUrl} caption={p.mediaCaption} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-zinc-800 dark:text-zinc-200">
                        {p.mediaCaption?.trim() || 'Post sem legenda'}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>{relativeTime(p.lastCommentAt)}</span>
                        <span>·</span>
                        <span>{p.total} {p.total === 1 ? 'comentário' : 'comentários'}</span>
                        {p.unreplied > 0 && (
                          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {p.unreplied} sem resposta
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
