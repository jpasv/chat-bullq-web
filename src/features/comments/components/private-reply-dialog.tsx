'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { commentsService, type SocialComment } from '../services/comments.service';
import { COMMENTS_QUERY_KEY } from '../hooks/use-comments';

interface Props {
  open: boolean;
  comment: SocialComment | null;
  onClose: () => void;
}

export function PrivateReplyDialog({ open, comment, onClose }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!open || !comment) return null;

  const goToInbox = (conversationId: string) => {
    onClose();
    setText('');
    router.push(`/inbox?conversationId=${conversationId}`);
  };

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const { conversationId } = await commentsService.privateReply(comment.id, value);
      queryClient.invalidateQueries({ queryKey: [COMMENTS_QUERY_KEY] });
      toast.success('DM enviada');
      goToInbox(conversationId);
    } catch (err: any) {
      if (err?.status === 409 && err?.body?.conversationId) {
        toast.info('Já existe uma DM aberta com esse contato.');
        goToInbox(err.body.conversationId);
        return;
      }
      toast.error(err?.message ?? 'Não foi possível enviar a DM');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Abrir DM com @{comment.authorUsername ?? comment.authorExternalId}
          </h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-6 py-5">
          <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            “{comment.text}”
          </p>
          <p className="text-xs text-zinc-500">
            O Instagram permite uma mensagem direta por comentário, até 7 dias depois dele. A conversa continua no Inbox.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Oi! Vi seu comentário e…"
            className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar DM
          </button>
        </div>
      </div>
    </div>
  );
}
