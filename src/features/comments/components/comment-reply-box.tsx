'use client';

import { useState } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onReply: (text: string) => Promise<void>;
  onSuggest: () => Promise<{ text: string; reason?: 'spam' }>;
}

export function CommentReplyBox({ onReply, onSuggest }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const out = await onSuggest();
      if (out.reason === 'spam') {
        toast.info('A IA achou que esse comentário não merece resposta.');
        return;
      }
      setText(out.text);
    } catch (err: any) {
      toast.error(err.message ?? 'Não foi possível sugerir');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSend = async () => {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      await onReply(value);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2200}
        placeholder="Responder publicamente…"
        className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting || sending}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Sugerir com IA
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Responder
        </button>
      </div>
    </div>
  );
}
