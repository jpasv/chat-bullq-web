'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Trash2, Square, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAudioRecorder } from '../hooks/use-audio-recorder';

export interface MentionParticipant {
  phone: string;
  name: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
}

interface ChatInputProps {
  onSend: (text: string, mentions?: string[] | 'all') => Promise<void>;
  onSendAudio?: (blob: Blob) => Promise<void>;
  onSendFile?: (file: File, caption?: string) => Promise<void>;
  disabled?: boolean;
  /** Participantes do grupo. Vazio/ausente desliga o autocomplete de @. */
  participants?: MentionParticipant[];
}

/** Entrada especial do menu: marca todo mundo do grupo. */
const MENTION_ALL = '__all__';
const MENTION_ALL_LABEL = 'todos';

// Espelha o whitelist do backend (UploadsService.ALLOWED_MEDIA_MIME) — o
// accept é só UX; a validação real acontece no upload.
const FILE_ACCEPT = [
  'image/*',
  'video/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
].join(',');

export function ChatInput({
  onSend,
  onSendAudio,
  onSendFile,
  disabled,
  participants = [],
}: ChatInputProps) {
  const [text, setText] = useState('');
  // Menções escolhidas nesta mensagem: rótulo exibido -> telefone (ou 'all').
  // No envio, cada rótulo vira `@<telefone>` no texto, que é o que o WhatsApp
  // precisa pra desenhar a menção destacada.
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  // Índice onde começa o `@` que está sendo digitado; null = menu fechado.
  const [mentionAt, setMentionAt] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [pastedImage, setPastedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();

  // Preview da imagem colada; revoga o objectURL em toda troca/descarte/unmount.
  useEffect(() => {
    if (!pastedImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pastedImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pastedImage]);

  const handleSubmit = useCallback(async () => {
    // Envio da imagem colada (com legenda opcional vinda do textarea).
    if (pastedImage) {
      if (isSendingFile || !onSendFile) return;
      setIsSendingFile(true);
      try {
        await onSendFile(pastedImage, text.trim() || undefined);
        setPastedImage(null);
        setText('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.message || 'Erro ao enviar imagem',
        );
      } finally {
        setIsSendingFile(false);
      }
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      // Troca `@Fulano` pelo `@<telefone>` que o protocolo exige, e junta os
      // telefones de quem realmente sobrou no texto (menção apagada não vai).
      let outbound = trimmed;
      const phones: string[] = [];
      let all = false;
      for (const [label, phone] of picked) {
        const token = `@${label}`;
        if (!outbound.includes(token)) continue;
        if (phone === MENTION_ALL) {
          all = true;
          continue;
        }
        outbound = outbound.split(token).join(`@${phone}`);
        phones.push(phone);
      }
      const mentions = all ? 'all' : phones.length ? phones : undefined;
      await onSend(outbound, mentions);
      setText('');
      setPicked(new Map());
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch {
      toast.error('Não foi possível enviar a mensagem. Seu texto foi mantido; tente enviar novamente.');
    } finally {
      setIsSending(false);
    }
  }, [pastedImage, text, isSending, isSendingFile, onSend, onSendFile, picked]);

  // Lista filtrada do menu de menção. "todos" só aparece sem busca ou quando
  // o texto digitado casa com ele.
  const mentionMatches = (() => {
    if (mentionAt === null || !participants.length) return [];
    const q = mentionQuery.toLowerCase();
    const people = participants.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q),
    );
    const withAll: MentionParticipant[] =
      !q || MENTION_ALL_LABEL.startsWith(q)
        ? [{ phone: MENTION_ALL, name: MENTION_ALL_LABEL, avatarUrl: null, isAdmin: false }]
        : [];
    return [...withAll, ...people].slice(0, 8);
  })();

  /** Fecha o menu sem escolher nada. */
  const closeMention = useCallback(() => {
    setMentionAt(null);
    setMentionQuery('');
    setMentionIndex(0);
  }, []);

  /**
   * Reavalia se o cursor está dentro de um `@algo`. Um `@` só abre o menu
   * quando está no começo do texto ou depois de espaço — assim e-mail não
   * dispara o autocomplete.
   */
  const syncMentionState = useCallback(
    (value: string, caret: number) => {
      if (!participants.length) return;
      const upto = value.slice(0, caret);
      const at = upto.lastIndexOf('@');
      if (at === -1) return closeMention();
      const before = at > 0 ? upto[at - 1] : ' ';
      const query = upto.slice(at + 1);
      // Espaço encerra a busca — nomes com espaço são escolhidos pelo menu,
      // não digitados por inteiro.
      if (!/\s/.test(before) || /\s/.test(query)) return closeMention();
      setMentionAt(at);
      setMentionQuery(query);
      setMentionIndex(0);
    },
    [participants.length, closeMention],
  );

  /** Insere a menção escolhida no lugar do `@parcial` que estava sendo digitado. */
  const applyMention = useCallback(
    (p: MentionParticipant) => {
      if (mentionAt === null) return;
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? text.length;
      const label = p.phone === MENTION_ALL ? MENTION_ALL_LABEL : p.name;
      const next = `${text.slice(0, mentionAt)}@${label} ${text.slice(caret)}`;
      setPicked((prev) => new Map(prev).set(label, p.phone));
      setText(next);
      closeMention();
      // Cursor logo depois da menção inserida.
      const pos = mentionAt + label.length + 2;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(pos, pos);
      });
    },
    [mentionAt, text, closeMention],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || !onSendFile) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault(); // evita colar o "path" como texto
          // Prints vêm sem nome útil ("image.png"); dá um nome único p/ o upload.
          const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const named =
            file.name && file.name !== 'image.png'
              ? file
              : new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
          setPastedImage(named);
          return; // usa só a primeira imagem
        }
      }
      // sem imagem no clipboard → deixa o paste de texto normal seguir
    },
    [onSendFile],
  );

  const discardImage = () => setPastedImage(null); // useEffect revoga a URL

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Com o menu de menção aberto, as setas/Enter/Tab pertencem a ele.
    if (mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleSendAudio = useCallback(async () => {
    if (!recorder.blob || !onSendAudio) return;
    setIsSendingAudio(true);
    try {
      await onSendAudio(recorder.blob);
      recorder.reset();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Erro ao enviar áudio',
      );
    } finally {
      setIsSendingAudio(false);
    }
  }, [recorder, onSendAudio]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Limpa o value pra permitir reenviar o MESMO arquivo em seguida —
      // sem isso o onChange não dispara na segunda escolha.
      e.target.value = '';
      if (!file || !onSendFile) return;
      setIsSendingFile(true);
      try {
        await onSendFile(file);
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.message || 'Erro ao enviar arquivo',
        );
      } finally {
        setIsSendingFile(false);
      }
    },
    [onSendFile],
  );

  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (disabled) {
    return (
      <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50">
        Conversa encerrada — reabra para enviar mensagens
      </div>
    );
  }

  // RECORDING MODE: shows a big bar with a pulsing red dot and the timer.
  if (recorder.state === 'recording') {
    return (
      <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-500/10">
          <button
            onClick={recorder.cancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20"
            aria-label="Cancelar gravação"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="font-medium tabular-nums">{formatElapsed(recorder.elapsedMs)}</span>
            <span className="text-xs opacity-70">Gravando…</span>
          </div>
          <button
            onClick={recorder.stop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600"
            aria-label="Parar gravação"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // PREVIEW MODE: the recording finished, user can listen/discard/send.
  if (recorder.state === 'stopped' && recorder.blob) {
    const audioSrc = URL.createObjectURL(recorder.blob);
    return (
      <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            onClick={recorder.cancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800"
            aria-label="Descartar áudio"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <audio
            controls
            src={audioSrc}
            className="h-9 flex-1 min-w-0"
          />
          <button
            onClick={handleSendAudio}
            disabled={isSendingAudio}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            aria-label="Enviar áudio"
          >
            {isSendingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </button>
        </div>
        {recorder.error && (
          <p className="mt-1 text-xs text-red-500">{recorder.error}</p>
        )}
      </div>
    );
  }

  // IDLE MODE: text input + mic button.
  const canRecord = !!onSendAudio;
  const showMic = canRecord && !text.trim() && !pastedImage;

  return (
    <div className="relative border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-3 z-20 mb-1 max-h-64 w-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {mentionMatches.map((p, i) => (
            <button
              key={p.phone}
              type="button"
              // onMouseDown: o onBlur do textarea fecharia o menu antes do click.
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(p);
              }}
              onMouseEnter={() => setMentionIndex(i)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === mentionIndex
                  ? 'bg-zinc-100 dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
              }`}
            >
              {p.phone === MENTION_ALL ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                  @
                </span>
              ) : p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-700"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">
                  {p.phone === MENTION_ALL ? `@${MENTION_ALL_LABEL}` : p.name}
                </span>
                {p.phone === MENTION_ALL ? (
                  <span className="ml-2 text-xs text-zinc-400">
                    marca o grupo inteiro
                  </span>
                ) : (
                  p.name.replace(/\D/g, '') !== p.phone && (
                    <span className="ml-2 text-xs text-zinc-400">{p.phone}</span>
                  )
                )}
              </span>
              {p.isAdmin && (
                <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  admin
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {pastedImage && previewUrl && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
          <img
            src={previewUrl}
            alt="Imagem colada"
            className="h-16 w-16 rounded-lg object-cover"
          />
          <span className="flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {pastedImage.name}
          </span>
          <button
            type="button"
            onClick={discardImage}
            disabled={isSendingFile}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 disabled:opacity-50 dark:hover:bg-zinc-800"
            aria-label="Descartar imagem"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!onSendFile || isSendingFile}
          className="mb-1 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
          aria-label="Anexar arquivo"
        >
          {isSendingFile ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            syncMentionState(e.target.value, e.target.selectionStart ?? 0);
          }}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onClick={(e) =>
            syncMentionState(
              (e.target as HTMLTextAreaElement).value,
              (e.target as HTMLTextAreaElement).selectionStart ?? 0,
            )
          }
          onBlur={() => setTimeout(closeMention, 120)}
          onPaste={handlePaste}
          placeholder={pastedImage ? 'Adicione uma legenda...' : 'Digite uma mensagem...'}
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        {showMic ? (
          <button
            onClick={recorder.start}
            type="button"
            className="mb-1 rounded-lg bg-zinc-100 p-2.5 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label="Gravar áudio"
          >
            <Mic className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={(!text.trim() && !pastedImage) || isSending || isSendingFile}
            className="mb-1 rounded-lg bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            aria-label="Enviar mensagem"
          >
            {isSending || isSendingFile ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
      {recorder.error && (
        <p className="mt-1.5 text-xs text-red-500">{recorder.error}</p>
      )}
    </div>
  );
}
