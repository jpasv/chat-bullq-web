'use client';

import { ExternalLink, Eye, EyeOff, Trash2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SocialComment } from '../services/comments.service';

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function StatusBadge({ status }: { status: SocialComment['status'] }) {
  if (status === 'VISIBLE') return null;
  const hidden = status === 'HIDDEN';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        hidden
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
      )}
    >
      {hidden ? <EyeOff className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
      {hidden ? 'Oculto' : 'Deletado'}
    </span>
  );
}

interface Props {
  comment: SocialComment;
  /** Slot para ações e caixa de resposta (Task 11). */
  children?: React.ReactNode;
  onHide?: (hidden: boolean) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  busy?: boolean;
}

export function CommentCard({ comment, children, onHide, onDelete, canDelete, busy }: Props) {
  const deleted = comment.status === 'DELETED';
  return (
    <article
      className={cn(
        'rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900',
        deleted && 'opacity-60',
      )}
    >
      <div className="flex gap-3">
        <a
          href={comment.mediaPermalink ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
          title={comment.mediaCaption ?? 'Post'}
        >
          {comment.mediaThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={comment.mediaThumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-5 w-5 text-zinc-400" />
          )}
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              @{comment.authorUsername ?? comment.authorExternalId}
            </span>
            <span className="text-xs text-zinc-400">{relativeTime(comment.commentedAt)}</span>
            <StatusBadge status={comment.status} />
            {comment.repliedAt && comment.status === 'VISIBLE' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                Respondido
              </span>
            )}
            {comment.mediaPermalink && (
              <a
                href={comment.mediaPermalink}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-primary"
              >
                Ver post <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {comment.mediaCaption && (
            <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{comment.mediaCaption}</p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
            {comment.text}
          </p>

          {!deleted && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {onHide && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onHide(comment.status !== 'HIDDEN')}
                  className="inline-flex items-center gap-1 text-zinc-500 hover:text-amber-600 disabled:opacity-50"
                >
                  {comment.status === 'HIDDEN' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {comment.status === 'HIDDEN' ? 'Desocultar' : 'Ocultar'}
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Deletar este comentário no Instagram? Não dá pra desfazer.')) onDelete();
                  }}
                  className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Deletar
                </button>
              )}
            </div>
          )}

          {comment.replies.length > 0 && (
            <ul className="mt-3 space-y-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              {comment.replies.map((r) => (
                <li key={r.id} className={cn('text-sm', r.status === 'DELETED' && 'line-through opacity-60')}>
                  <span className={cn('font-medium', r.isFromPage ? 'text-primary' : 'text-zinc-700 dark:text-zinc-300')}>
                    {r.isFromPage ? 'Você' : `@${r.authorUsername ?? r.authorExternalId}`}
                  </span>
                  <span className="ml-1 text-xs text-zinc-400">{relativeTime(r.commentedAt)}</span>
                  <StatusBadge status={r.status} />
                  <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{r.text}</p>
                </li>
              ))}
            </ul>
          )}

          {!deleted && children}
        </div>
      </div>
    </article>
  );
}
