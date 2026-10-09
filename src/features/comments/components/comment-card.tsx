'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Eye, EyeOff, MessageCircle, Reply, Trash2 } from 'lucide-react';
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

function Avatar({ name }: { name: string }) {
  const initial = name.replace(/^@/, '').charAt(0).toUpperCase() || '?';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {initial}
    </div>
  );
}

const actionCls =
  'inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800';

interface Props {
  comment: SocialComment;
  /** Caixa de resposta; só renderiza quando o usuário clica em "Responder". */
  children?: React.ReactNode;
  onHide?: (hidden: boolean) => void;
  onDelete?: () => void;
  onOpenDm?: () => void;
  canDelete?: boolean;
  busy?: boolean;
}

/** Card compacto: thread recolhida, ações ao passar o mouse, resposta sob demanda. */
export function CommentCard({ comment, children, onHide, onDelete, onOpenDm, canDelete, busy }: Props) {
  const deleted = comment.status === 'DELETED';
  const author = `@${comment.authorUsername ?? comment.authorExternalId}`;
  const [threadOpen, setThreadOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const replies = comment.replies;

  return (
    <article
      className={cn(
        'group rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900',
        deleted && 'opacity-60',
      )}
    >
      <div className="flex gap-3">
        <Avatar name={author} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{author}</span>
            <span className="text-xs text-zinc-400">{relativeTime(comment.commentedAt)}</span>
            <StatusBadge status={comment.status} />
            {comment.repliedAt && comment.status === 'VISIBLE' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                Respondido
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">{comment.text}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {replies.length > 0 && (
              <button
                type="button"
                onClick={() => setThreadOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {threadOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}
              </button>
            )}

            {!deleted && (
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
                {children && (
                  <button type="button" disabled={busy} onClick={() => setReplyOpen((v) => !v)} className={actionCls}>
                    <Reply className="h-3.5 w-3.5" /> Responder
                  </button>
                )}
                {!comment.isFromPage && (
                  comment.privateReplyConversationId ? (
                    <Link
                      href={`/inbox?conversationId=${comment.privateReplyConversationId}`}
                      className={cn(actionCls, 'text-primary')}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Ver DM
                    </Link>
                  ) : onOpenDm ? (
                    <button type="button" disabled={busy} onClick={onOpenDm} className={actionCls}>
                      <MessageCircle className="h-3.5 w-3.5" /> Abrir DM
                    </button>
                  ) : null
                )}
                {onHide && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onHide(comment.status !== 'HIDDEN')}
                    className={cn(actionCls, 'hover:text-amber-600')}
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
                    className={cn(actionCls, 'hover:text-red-600')}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Deletar
                  </button>
                )}
              </div>
            )}
          </div>

          {threadOpen && replies.length > 0 && (
            <ul className="mt-2 space-y-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              {replies.map((r) => (
                <li key={r.id} className={cn('text-sm', r.status === 'DELETED' && 'line-through opacity-60')}>
                  <span className={cn('font-medium', r.isFromPage ? 'text-primary' : 'text-zinc-700 dark:text-zinc-300')}>
                    {r.isFromPage ? 'Você' : `@${r.authorUsername ?? r.authorExternalId}`}
                  </span>
                  <span className="ml-1 text-xs text-zinc-400">{relativeTime(r.commentedAt)}</span>{' '}
                  <StatusBadge status={r.status} />
                  <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{r.text}</p>
                </li>
              ))}
            </ul>
          )}

          {!deleted && replyOpen && children}
        </div>
      </div>
    </article>
  );
}
