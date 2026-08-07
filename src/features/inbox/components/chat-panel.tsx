'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Clock, AlertCircle, ExternalLink, Reply, Trash2, X, Ban, Forward } from 'lucide-react';
import { toast } from 'sonner';
import { inboxService, type Conversation, type Message } from '../services/inbox.service';
import { ChatInput } from './chat-input';
import { ConversationHeader } from './conversation-header';
import { StoryReplyCard } from './story-reply-card';
import { ForwardMessageDialog } from './forward-message-dialog';
import { AudioMessagePlayer } from './audio-message-player';
import {
  MediaImage,
  MediaVideo,
  MediaDocument,
  MediaSticker,
  MediaLocation,
} from './media-bubbles';
import { useSocket } from '../hooks/use-socket';
import { useAuthStore } from '@/stores/auth-store';
import { PendingActionsList } from '../pending-actions/pending-actions-list';

interface ChatPanelProps {
  conversation: Conversation;
  onConversationUpdate: () => void;
  /** Forwarded to ConversationHeader so the agent-runs sidebar toggle
   *  shows up in the chat header. */
  onToggleAgentLogs?: () => void;
  agentLogsOpen?: boolean;
  /** Forwarded to ConversationHeader for the Project panel toggle (groups). */
  onToggleProject?: () => void;
  projectOpen?: boolean;
}

const statusIcons: Record<string, React.ElementType> = {
  QUEUED: Clock,
  SENT: Check,
  DELIVERED: CheckCheck,
  READ: CheckCheck,
  FAILED: AlertCircle,
};

/**
 * Banner de aviso quando a conversa está fora da "janela de atendimento"
 * do WhatsApp (24h sem mensagem do cliente). Sem template aprovado, qualquer
 * mensagem livre é rejeitada pelo provider com `failed_reason: Re-engagement
 * message`.
 *
 * Heurística client-side: olha as últimas mensagens já carregadas e procura
 * a última INBOUND. Se nenhuma encontrada nos buffer atual, OU se ela é mais
 * velha que 24h, mostra o banner. Não 100% preciso (paginação pode esconder
 * inbound antiga) mas resolve >95% dos casos sem precisar de campo novo no
 * backend.
 */
function EngagementWindowBanner({
  channelType,
  messages,
}: {
  channelType: string;
  messages: Message[];
}) {
  // Janela 24h é regra rígida APENAS do WhatsApp Cloud API oficial (Meta).
  // Canais Zappfy/Uazapi (WHATSAPP_ZAPPFY) não têm essa restrição — banner
  // ali confunde mais que ajuda.
  if (channelType !== 'WHATSAPP_OFFICIAL') return null;
  if (messages.length === 0) return null;

  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.direction === 'INBOUND');
  if (!lastInbound) return null;

  const ageMs = Date.now() - new Date(lastInbound.createdAt).getTime();
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours < 24) return null;

  const ageLabel =
    ageHours < 48
      ? `${Math.floor(ageHours)}h`
      : `${Math.floor(ageHours / 24)} dias`;

  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1 leading-relaxed">
        <strong>Janela de 24h expirada</strong> — última mensagem do cliente
        foi há {ageLabel}. WhatsApp só aceita{' '}
        <strong>templates aprovados</strong> agora. Mensagem de texto livre
        vai falhar com erro <code className="font-mono text-[11px]">Re-engagement message</code>.
        Peça pro cliente mandar qualquer mensagem pra reabrir a janela, ou
        envie um template HSM via Meta Business.
      </div>
    </div>
  );
}

/**
 * Tooltip humano pra cada status. Especial pra FAILED com motivo conhecido
 * — operador entende que precisa de template em vez de relê o erro do
 * provider em inglês ("Re-engagement message").
 */
function statusTooltip(status: string, failedReason?: string | null): string {
  switch (status) {
    case 'QUEUED':
      return 'Enviando…';
    case 'SENT':
      return 'Enviado pro provedor';
    case 'DELIVERED':
      return 'Entregue ao destinatário';
    case 'READ':
      return 'Lida';
    case 'FAILED':
      if (failedReason && /re-?engagement/i.test(failedReason)) {
        return 'Falhou: cliente sem mensagem há mais de 24h. Use um template aprovado pra reabrir a conversa.';
      }
      if (failedReason) return `Falhou: ${failedReason}`;
      return 'Falhou ao enviar';
    default:
      return status;
  }
}

const MESSAGES_PAGE_SIZE = 50;
/** Quanto o histórico cresce a cada tentativa de achar a mensagem citada. */
const HISTORY_STEP = 150;
/** Teto de mensagens carregadas — além disso a conversa fica pesada demais. */
const MAX_HISTORY = 800;

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const IG_CDN_HOSTS = /(lookaside\.fbsbx\.com|cdninstagram\.com|fbcdn\.net)/i;

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function LinkPreviewCard({ url, isOutbound }: { url: string; isOutbound: boolean }) {
  const [imgOk, setImgOk] = useState(IG_CDN_HOSTS.test(url));
  const host = safeHostname(url);

  if (imgOk) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt="Mídia compartilhada"
          className="max-h-64 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800"
          onError={() => setImgOk(false)}
        />
        <span
          className={`mt-1 block text-[10px] ${
            isOutbound ? 'opacity-80' : 'text-zinc-400'
          }`}
        >
          {host}
        </span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
        isOutbound
          ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15'
          : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800'
      }`}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate font-medium">{host}</span>
    </a>
  );
}

function matchSingleUrl(text: string): string | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^(https?:\/\/\S+)$/i);
  return m ? m[1] : null;
}

function renderInlineTextWithLinks(text: string, isOutbound: boolean) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 wrap-break-word ${
            isOutbound ? 'text-primary-foreground' : 'text-primary'
          }`}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * No protocolo do WhatsApp a menção viaja como `@<telefone>`. Na tela isso é
 * ilegível, então trocamos pelo nome de quem conhecemos. Quem não está na
 * lista continua aparecendo como número, igual ao app oficial.
 */
function humanizeMentions(
  text: string,
  nameByPhone?: Map<string, string>,
): string {
  if (!nameByPhone?.size) return text;
  return text.replace(/@(\d{10,15})\b/g, (full, phone) => {
    const name = nameByPhone.get(phone);
    return name ? `@${name}` : full;
  });
}

function MessageText({
  text,
  isOutbound,
  className = '',
  mentionNames,
}: {
  text: string;
  isOutbound: boolean;
  className?: string;
  mentionNames?: Map<string, string>;
}) {
  const shown = humanizeMentions(text, mentionNames);
  const onlyUrl = matchSingleUrl(shown);
  if (onlyUrl) {
    return <LinkPreviewCard url={onlyUrl} isOutbound={isOutbound} />;
  }
  return (
    <p className={`whitespace-pre-wrap wrap-break-word text-sm ${className}`}>
      {renderInlineTextWithLinks(shown, isOutbound)}
    </p>
  );
}

interface TemplateButtonShape {
  type?: string;
  title?: string;
  url?: string;
  payload?: string;
}

interface TemplateElementShape {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  defaultActionUrl?: string;
  buttons?: TemplateButtonShape[];
}

function TemplateButtonRow({
  buttons,
  isOutbound,
}: {
  buttons: TemplateButtonShape[];
  isOutbound: boolean;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      {buttons.map((btn, i) => {
        const label = btn.title || btn.url || btn.payload || 'Botão';
        const baseClass = `block rounded-md border px-3 py-1.5 text-center text-xs font-medium transition-colors ${
          isOutbound
            ? 'border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800'
        }`;
        if (btn.url) {
          return (
            <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className={baseClass}>
              {label}
            </a>
          );
        }
        return (
          <span
            key={i}
            className={`${baseClass} cursor-default opacity-80`}
            title={btn.payload || btn.type || ''}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function TemplateMessage({
  content,
  isOutbound,
}: {
  content: Record<string, any>;
  isOutbound: boolean;
}) {
  const tpl = (content?.template ?? {}) as {
    templateType?: string;
    text?: string;
    buttons?: TemplateButtonShape[];
    elements?: TemplateElementShape[];
  };
  const headerText = tpl.text || content?.text;
  const elements = tpl.elements ?? [];
  const buttons = tpl.buttons ?? [];

  // Envio HSM da Cloud API: o `content` é o payload que mandamos pro Meta
  // (`{name, language, components}`) e o corpo aprovado do template só existe
  // lá — não temos o texto. Sem este fallback a bolha ficava em branco.
  // Mostramos o que de fato enviamos: o template e as variáveis preenchidas.
  const hsmName: string | undefined = !headerText ? content?.name : undefined;
  const hsmParams: string[] = hsmName
    ? ((content?.components ?? []) as any[])
        .flatMap((c) => (c?.parameters ?? []) as any[])
        .map((p) => p?.text)
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-2">
      {headerText && <MessageText text={headerText} isOutbound={isOutbound} />}

      {hsmName && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            isOutbound
              ? 'border-primary-foreground/20 bg-primary-foreground/5'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60'
          }`}
        >
          <p className="font-medium">Modelo: {hsmName}</p>
          {hsmParams.length > 0 && (
            <p className="mt-0.5 opacity-80">{hsmParams.join(' · ')}</p>
          )}
        </div>
      )}

      {elements.map((el, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-lg border ${
            isOutbound
              ? 'border-primary-foreground/20 bg-primary-foreground/5'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60'
          }`}
        >
          {el.imageUrl && (
            <a
              href={el.defaultActionUrl || el.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={el.imageUrl}
                alt={el.title || 'Template'}
                className="max-h-48 w-full object-cover"
              />
            </a>
          )}
          {(el.title || el.subtitle) && (
            <div className="px-3 py-2">
              {el.title && <p className="text-sm font-medium">{el.title}</p>}
              {el.subtitle && (
                <p className="mt-0.5 text-xs opacity-75">{el.subtitle}</p>
              )}
            </div>
          )}
          {el.buttons && el.buttons.length > 0 && (
            <div className="px-3 pb-2">
              <TemplateButtonRow buttons={el.buttons} isOutbound={isOutbound} />
            </div>
          )}
        </div>
      ))}

      {buttons.length > 0 && <TemplateButtonRow buttons={buttons} isOutbound={isOutbound} />}

      {!headerText && elements.length === 0 && buttons.length === 0 && (
        <p className="text-sm italic opacity-70">[Template]</p>
      )}
    </div>
  );
}

function ContactAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '??').slice(0, 2).toUpperCase();
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-sm';
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className={`${dim} shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-700`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400`}
    >
      {initials}
    </div>
  );
}

export function ChatPanel({
  conversation,
  onConversationUpdate,
  onToggleAgentLogs,
  agentLogsOpen,
  onToggleProject,
  projectOpen,
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { on, emit, onReconnect } = useSocket();
  const user = useAuthStore((s) => s.user);

  // Quantas mensagens pedimos ao backend. A página 1 devolve as N mais
  // recentes, então "carregar histórico" é só aumentar o limite — sem offset,
  // que escorregaria a cada mensagem nova chegando durante a navegação.
  // Fica num ref (e não só no state) pra key da query continuar estável:
  // o merge do socket e os outros setQueryData referenciam ['messages', id].
  const limitRef = useRef(MESSAGES_PAGE_SIZE);
  const [historyLimit, setHistoryLimit] = useState(MESSAGES_PAGE_SIZE);
  // Mensagem destacada pelo "pular pra citada". Fica em state (não em
  // classList) pra sobreviver aos re-renders do realtime durante o destaque.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: () => inboxService.getMessages(conversation.id, 1, limitRef.current),
    // Defenses against socket gaps: refetch when the tab regains focus
    // and on browser-level reconnect. Realtime is the happy path; these
    // catch the case where a `message:new` was missed.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 5000,
  });

  // Participantes só interessam em grupo e mudam pouco — busca uma vez por
  // conversa e mantém em cache. Falha aqui não quebra o chat: sem lista, o
  // composer apenas não oferece menção.
  const { data: participants = [] } = useQuery({
    queryKey: ['group-participants', conversation.id],
    queryFn: () => inboxService.getGroupParticipants(conversation.id),
    enabled: !!conversation.isGroup,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // telefone -> nome, pra trocar `@5545...` pelo nome na hora de exibir.
  const mentionNames = useMemo(
    () => new Map(participants.map((p) => [p.phone, p.name])),
    [participants],
  );

  // nome -> foto, pra dar rosto a quem manda mensagem no grupo. A mensagem
  // guarda o nome do remetente (não o telefone), então é por aí que casamos.
  const avatarBySender = useMemo(
    () =>
      new Map(
        participants
          .filter((p) => p.avatarUrl)
          .map((p) => [p.name, p.avatarUrl as string]),
      ),
    [participants],
  );

  const messages = data?.messages || [];

  useEffect(() => {
    emit('join:conversation', { conversationId: conversation.id });
    return () => {
      emit('leave:conversation', { conversationId: conversation.id });
    };
  }, [conversation.id, emit]);

  // Merge de uma mensagem no cache da conversa. Usado tanto pelo socket
  // (message:new) quanto pela resposta do POST /messages — assim a mensagem
  // enviada aparece na hora mesmo se o websocket estiver caído. Dedup por
  // id/externalId garante que receber pelos dois caminhos não duplica.
  const mergeMessage = useCallback(
    (msg: Message) => {
      // Merge into the current cache. If there's no cache yet (initial
      // fetch still in flight, or cache evicted) we DON'T discard the
      // event — we invalidate so the refetch picks the new message up.
      const existingCache = queryClient.getQueryData<{ messages: Message[] }>([
        'messages',
        conversation.id,
      ]);
      if (!existingCache) {
        queryClient.invalidateQueries({
          queryKey: ['messages', conversation.id],
        });
        return;
      }
      queryClient.setQueryData<{ messages: Message[] }>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          const existing = prev.messages || [];
          // Dedup by id (authoritative) or by externalId when present.
          const match = existing.findIndex(
            (m) =>
              m.id === msg.id ||
              (msg.externalId && m.externalId && m.externalId === msg.externalId),
          );
          if (match !== -1) {
            const merged = [...existing];
            merged[match] = { ...existing[match], ...msg };
            return { ...prev, messages: merged };
          }
          return { ...prev, messages: [...existing, msg] };
        },
      );
    },
    [conversation.id, queryClient],
  );

  useEffect(() => {
    const unsubNew = on('message:new', (payload: any) => {
      const msg = payload.message;
      if (!msg) return;
      const convId = payload.conversationId ?? msg.conversationId;
      if (convId !== conversation.id) return;
      mergeMessage(msg);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const unsubStatus = on('message:status', (payload: any) => {
      if (payload.conversationId !== conversation.id) return;
      const ids: string[] = payload.messageIds ?? (payload.messageId ? [payload.messageId] : []);
      if (ids.length === 0) return;
      queryClient.setQueryData<{ messages: Message[] } | undefined>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              ids.includes(m.id) ? { ...m, status: payload.status } : m,
            ),
          };
        },
      );
    });
    // Reconnect: any messages that arrived during the offline window are
    // gone from this client's perspective (socket misses events while
    // disconnected). Refetch the open conversation's messages on every
    // reconnect, plus the conversation list, so the user comes back to a
    // correct view without having to F5.
    const unsubReconnect = onReconnect(() => {
      queryClient.invalidateQueries({
        queryKey: ['messages', conversation.id],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    // Watchdog/admin revogou uma mensagem — pinta a bolha como "deletada"
    // pra todo mundo que tá com a conversa aberta, sem refresh.
    const unsubRevoked = on('message:revoked', (payload: any) => {
      if (payload?.conversationId !== conversation.id) return;
      if (!payload?.messageId) return;
      queryClient.setQueryData<{ messages: Message[] } | undefined>(
        ['messages', conversation.id],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === payload.messageId
                ? {
                    ...m,
                    revokedAt: payload.revokedAt,
                    revokedBy: payload.revokedBy,
                    revokeSucceededRemote: payload.succeededRemote,
                  }
                : m,
            ),
          };
        },
      );
    });
    // Foto do contato/grupo que o backend acabou de buscar: troca no header
    // sem refetch. Em grupo, também derruba o cache dos participantes, que é
    // de onde sai a foto de quem escreveu cada mensagem.
    const unsubAvatar = on('contact:avatar', (payload: any) => {
      const contactId = payload?.contactId;
      const avatarUrl = payload?.avatarUrl;
      if (!contactId || !avatarUrl) return;
      if (conversation.contact?.id === contactId) {
        queryClient.setQueryData<any>(['conversation', conversation.id], (old: any) =>
          old ? { ...old, contact: { ...old.contact, avatarUrl } } : old,
        );
      }
      if (conversation.isGroup) {
        queryClient.invalidateQueries({
          queryKey: ['group-participants', conversation.id],
        });
      }
    });

    return () => {
      unsubNew?.();
      unsubStatus?.();
      unsubReconnect?.();
      unsubRevoked?.();
      unsubAvatar?.();
    };
  }, [
    conversation.id,
    conversation.contact?.id,
    conversation.isGroup,
    on,
    onReconnect,
    queryClient,
    mergeMessage,
  ]);

  const handleRevoke = useCallback(
    async (msg: Message) => {
      const ok = window.confirm(
        'Deletar essa mensagem pra todos? ' +
          'Em WhatsApp via Zappfy a mensagem some no app do cliente. ' +
          'Em WhatsApp Cloud API e Instagram, ela some apenas no Chat Conect ' +
          '(limitação da Meta — o cliente continua vendo no app dele).',
      );
      if (!ok) return;
      try {
        const result = await inboxService.revokeMessage(msg.id);
        if (result.succeededRemote) {
          toast.success('Mensagem deletada pra todos');
        } else {
          toast.warning(
            'Mensagem deletada só no Chat Conect. ' +
              'O cliente ainda vê a mensagem no app dele (limitação do canal).',
          );
        }
        // Otimista: marca local enquanto o realtime não chega
        queryClient.setQueryData<{ messages: Message[] } | undefined>(
          ['messages', conversation.id],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === msg.id
                  ? {
                      ...m,
                      revokedAt: result.revokedAt,
                      revokedBy: result.revokedBy,
                      revokeSucceededRemote: result.succeededRemote,
                    }
                  : m,
              ),
            };
          },
        );
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            'Erro ao deletar mensagem',
        );
      }
    },
    [conversation.id, queryClient],
  );

  // Auto-scroll pro fim quando chega mensagem NOVA. Observa o id da última
  // mensagem, não a contagem: carregar histórico antigo também aumenta a
  // contagem, e aí o scroll pro fim desfaria o "pular pra citada".
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageId]);

  const hasMoreHistory =
    (data?.pagination?.total ?? 0) > messages.length &&
    historyLimit < MAX_HISTORY;

  /** Carrega mais um lote de histórico. Devolve false quando não há o que carregar. */
  const loadMoreHistory = useCallback(async () => {
    if (limitRef.current >= MAX_HISTORY) return false;
    limitRef.current = Math.min(MAX_HISTORY, limitRef.current + HISTORY_STEP);
    setHistoryLimit(limitRef.current);
    const before = messages.length;
    // O lote entra ACIMA do que está na tela; sem compensar, a leitura salta.
    // Guardamos a altura antes e reposicionamos pela diferença depois.
    const heightBefore = scrollRef.current?.scrollHeight ?? 0;
    const offsetBefore = scrollRef.current?.scrollTop ?? 0;
    await queryClient.refetchQueries({
      queryKey: ['messages', conversation.id],
      exact: true,
    });
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = offsetBefore + (el.scrollHeight - heightBefore);
    });
    const after =
      queryClient.getQueryData<{ messages: Message[] }>([
        'messages',
        conversation.id,
      ])?.messages.length ?? before;
    // Nada novo veio: já estamos no começo da conversa.
    return after > before;
  }, [conversation.id, messages.length, queryClient]);

  /**
   * Leva o usuário até a mensagem citada. Ela pode estar fora do trecho
   * carregado — nesse caso vamos puxando histórico até achar (ou até bater
   * no teto, quando avisamos em vez de falhar em silêncio).
   */
  const jumpToMessage = useCallback(
    async (targetId?: string) => {
      if (!targetId) return;

      const focus = () => {
        const el = document.getElementById(`msg-${targetId}`);
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(targetId);
        setTimeout(() => {
          setHighlightedId((current) => (current === targetId ? null : current));
        }, 2000);
        return true;
      };

      if (focus()) return;

      while (limitRef.current < MAX_HISTORY) {
        const grew = await loadMoreHistory();
        // Espera o React pintar o lote novo antes de procurar no DOM.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        if (focus()) return;
        if (!grew) break;
      }

      toast.info('A mensagem citada não está mais no histórico desta conversa.');
    },
    [loadMoreHistory],
  );

  // Reply state — quando setado, próxima msg enviada vai com replyToMessageId
  // e a UI mostra a barra "respondendo a..." acima do input. Reseta ao
  // trocar de conversa (via key prop do ChatPanel) ou ao mandar a msg.
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const startReply = useCallback((message: Message) => {
    setReplyingTo(message);
  }, []);
  const cancelReply = useCallback(() => setReplyingTo(null), []);

  // Forward state — quando setado, abre o modal de escolher destino(s).
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const startForward = useCallback((message: Message) => {
    setForwardingMessage(message);
  }, []);

  const handleSend = async (text: string, mentions?: string[] | 'all') => {
    const replyToMessageId = replyingTo?.id;
    try {
      // Insere a mensagem no cache com a resposta do POST — não dependemos
      // só do message:new via socket pra mostrar a própria mensagem (se o
      // socket estiver caído, ela apareceria só no próximo refetch).
      const sent = await inboxService.sendMessage({
        conversationId: conversation.id,
        type: 'TEXT',
        content: mentions ? { text, mentions } : { text },
        replyToMessageId,
      });
      if (sent?.id) mergeMessage(sent);
      setReplyingTo(null);
    } catch (err) {
      // Fallback: if send fails before the socket event arrives, force a refresh.
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      throw err;
    }
  };

  const handleSendAudio = async (blob: Blob) => {
    try {
      const sent = await inboxService.sendAudioMessage(conversation.id, blob);
      if (sent?.id) mergeMessage(sent);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      throw err;
    }
  };

  const handleSendFile = async (file: File, caption?: string) => {
    try {
      const sent = await inboxService.sendMediaMessage(conversation.id, file, caption);
      if (sent?.id) mergeMessage(sent);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      throw err;
    }
  };

  // Hora embaixo de cada bolha. Se a msg não for de hoje, prefixa com
  // a data curta ("DD/MM 16:58") pra não precisar caçar o separador
  // rolando o histórico inteiro.
  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    const showYear = d.getFullYear() !== now.getFullYear();
    const datePart = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      ...(showYear ? { year: '2-digit' } : {}),
    });
    return `${datePart} ${time}`;
  };

  // Separador de data no estilo WhatsApp: agrupa mensagens por dia.
  // "Hoje" / "Ontem" / dia da semana (últimos 7 dias) / "25 de maio" /
  // "25/05/2024" quando o ano é diferente.
  const formatDateSeparator = (date: string) => {
    const d = new Date(date);
    const startOfDay = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const now = new Date();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (dayDiff === 0) return 'Hoje';
    if (dayDiff === 1) return 'Ontem';
    if (dayDiff > 1 && dayDiff < 7) {
      const w = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      return w.charAt(0).toUpperCase() + w.slice(1);
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    }
    return d.toLocaleDateString('pt-BR');
  };

  return (
    // min-h-0 é load-bearing: sem ele, o scroll-container interno cresce
    // pelo conteúdo (default min-height de flex children) e empurra o
    // ChatInput pra fora do painel — quebra dramaticamente quando o pai
    // é um modal com altura fixa.
    <div className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader
        conversation={conversation}
        onUpdate={onConversationUpdate}
        onToggleAgentLogs={onToggleAgentLogs}
        agentLogsOpen={agentLogsOpen}
        onToggleProject={onToggleProject}
        projectOpen={projectOpen}
      />

      <PendingActionsList conversationId={conversation.id} />

      <EngagementWindowBanner
        channelType={conversation.channel.type}
        messages={messages}
      />

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-900/50"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            {hasMoreHistory && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => loadMoreHistory()}
                  disabled={isFetching}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {isFetching ? 'Carregando…' : 'Carregar mensagens anteriores'}
                </button>
              </div>
            )}
            {(() => {
              const reactionMap = new Map<string, string[]>();
              for (const msg of messages) {
                if (msg.type === 'REACTION' && msg.content?.reaction) {
                  const targetId = msg.content.reaction.targetMessageId;
                  if (targetId) {
                    const existing = reactionMap.get(targetId) || [];
                    existing.push(msg.content.reaction.emoji);
                    reactionMap.set(targetId, existing);
                  }
                }
              }
              const visibleMessages = messages.filter((m) => m.type !== 'REACTION');
              let lastDateKey = '';
              return visibleMessages.map((msg) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                const StatusIcon = statusIcons[msg.status] || Clock;
                const reactions = reactionMap.get(msg.externalId || '') || [];
                const isRevoked = !!msg.revokedAt;
                const msgDate = new Date(msg.createdAt);
                const dateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
                const showDateSeparator = dateKey !== lastDateKey;
                lastDateKey = dateKey;
                return (
                  <Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center pb-1 pt-3 first:pt-0">
                      <span className="rounded-full bg-zinc-200/80 px-3 py-1 text-[11px] font-medium text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    id={`msg-${msg.id}`}
                    className={`group flex items-end gap-2 rounded-lg transition-colors duration-500 ${
                      isOutbound ? 'justify-end' : 'justify-start'
                    } ${
                      highlightedId === msg.id
                        ? 'bg-primary/10 ring-2 ring-primary'
                        : ''
                    }`}
                  >
                    {/* Botão "Responder" no hover. Aparece do lado de
                        FORA da bolha — esquerda quando outbound (msg
                        nossa, espaço à direita da bolha), direita quando
                        inbound (msg do cliente, espaço à esquerda).
                        Reactions e bolhas curtas mantêm o botão visível.
                        Mensagens já revogadas não mostram ações. */}
                    {isOutbound && !isRevoked && (
                      <div className="flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:text-zinc-100"
                          title="Responder"
                          aria-label="Responder esta mensagem"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startForward(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:text-zinc-100"
                          title="Encaminhar"
                          aria-label="Encaminhar esta mensagem"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-red-600 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:text-red-400"
                          title="Deletar pra todos"
                          aria-label="Deletar mensagem pra todos"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {!isOutbound && (
                      <ContactAvatar
                        size="sm"
                        name={
                          conversation.isGroup && msg.senderName
                            ? msg.senderName
                            : conversation.contact.name
                        }
                        avatarUrl={
                          conversation.isGroup
                            ? // Em grupo o avatar é de quem escreveu, não do
                              // grupo. Sem match (participante que saiu, ou
                              // que não é contato nosso), cai nas iniciais.
                              (msg.senderName
                                ? avatarBySender.get(msg.senderName)
                                : null) ?? null
                            : conversation.contact.avatarUrl
                        }
                      />
                    )}
                    <div className="relative max-w-[75%]">
                      {conversation.isGroup && !isOutbound && msg.senderName && (
                        <p className="mb-0.5 ml-1 text-xs font-semibold text-primary">
                          {msg.senderName}
                        </p>
                      )}
                      {isOutbound && (msg.sender?.name || (msg.senderId && msg.senderId === user?.id && user?.name)) && (
                        <p className="mb-0.5 mr-1 text-right text-xs font-semibold text-primary">
                          {msg.sender?.name || user?.name}
                        </p>
                      )}
                      {msg.metadata?.replyTo?.story && (
                        <StoryReplyCard
                          story={msg.metadata.replyTo.story}
                          isOutbound={isOutbound}
                        />
                      )}
                      {msg.metadata?.replyTo?.ad && (
                        <div
                          className={`mb-1 rounded-xl border px-3 py-2 text-xs ${
                            isOutbound
                              ? 'border-primary/40 bg-primary/10 text-primary dark:text-primary-foreground/90'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400'
                          }`}
                        >
                          <p className="text-[10px] uppercase tracking-wider opacity-70">
                            Respondeu ao anúncio
                          </p>
                          {msg.metadata.replyTo.ad.title && (
                            <p className="mt-0.5 font-medium">
                              {msg.metadata.replyTo.ad.title}
                            </p>
                          )}
                        </div>
                      )}
                      {/* Quote box: aparece quando a msg respondeu outra
                          mensagem (reply nativo do WhatsApp/Cloud API ou
                          fallback do Instagram que persistimos via
                          metadata.replyTo). Click scrolla até a msg
                          original quando a temos no histórico carregado. */}
                      {msg.metadata?.replyTo &&
                        (msg.metadata.replyTo.previewText ||
                          msg.metadata.replyTo.senderName) && (
                          <button
                            type="button"
                            onClick={() =>
                              jumpToMessage(msg.metadata?.replyTo?.messageId)
                            }
                            className={`mb-1 block w-full rounded-md border-l-2 border-primary px-2 py-1 text-left text-xs ${
                              isOutbound
                                ? // O quote fica FORA da bolha, sobre o fundo da
                                  // página — texto tem que contrastar com ele, não
                                  // com o azul da bolha.
                                  'bg-primary/10 text-primary hover:bg-primary/20 dark:text-primary-foreground/90'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/70 dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            {msg.metadata.replyTo.senderName && (
                              <p className="text-[10px] font-semibold opacity-80">
                                {msg.metadata.replyTo.senderName}
                              </p>
                            )}
                            {msg.metadata.replyTo.previewText && (
                              // Mesma troca de @telefone por nome que a
                              // mensagem normal faz — sem isso a citação de
                              // uma mensagem com menção mostrava o número.
                              <p className="mt-0.5 truncate">
                                {humanizeMentions(
                                  msg.metadata.replyTo.previewText,
                                  mentionNames,
                                )}
                              </p>
                            )}
                          </button>
                        )}
                      {isRevoked ? (
                        <div
                          className={`flex items-center gap-2 rounded-2xl border border-dashed px-4 py-2.5 italic ${
                            isOutbound
                              ? 'rounded-br-md border-primary/40 bg-primary/5 text-primary/70'
                              : 'rounded-bl-md border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-500'
                          }`}
                          title={
                            msg.revokeSucceededRemote
                              ? 'Mensagem deletada pra todos (provider confirmou).'
                              : 'Deletada apenas no Chat Conect — o cliente ainda pode estar vendo no app dele.'
                          }
                        >
                          <Ban className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-sm">
                            Mensagem deletada
                            {msg.revokeSucceededRemote === false ? ' (só aqui)' : ''}
                          </span>
                          <span className="ml-auto text-[10px] opacity-70">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      ) : msg.type === 'AUDIO' ? (
                        <>
                          <AudioMessagePlayer
                            message={msg}
                            isOutbound={isOutbound}
                            onTranscribed={() => {
                              queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
                            }}
                          />
                          <div
                            className={`mt-1 flex items-center gap-1 px-1 text-[10px] ${
                              isOutbound ? 'justify-end text-zinc-400' : 'text-zinc-400'
                            }`}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span title={statusTooltip(msg.status, msg.failedReason)}>
                                <StatusIcon
                                  className={`h-3 w-3 ${
                                    msg.status === 'FAILED'
                                      ? 'text-red-500'
                                      : msg.status === 'READ'
                                        ? 'text-primary'
                                        : ''
                                  }`}
                                />
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isOutbound
                              ? 'rounded-br-md bg-primary text-primary-foreground'
                              : 'rounded-bl-md bg-white shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                          }`}
                        >
                          {msg.type === 'TEXT' ? (
                            <MessageText
                              text={msg.content?.text || ''}
                              isOutbound={isOutbound}
                              mentionNames={mentionNames}
                            />
                          ) : msg.type === 'IMAGE' ? (
                            <MediaImage message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'VIDEO' ? (
                            <MediaVideo message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'DOCUMENT' ? (
                            <MediaDocument message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'STICKER' ? (
                            <MediaSticker message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'LOCATION' ? (
                            <MediaLocation message={msg} isOutbound={isOutbound} />
                          ) : msg.type === 'TEMPLATE' ? (
                            <TemplateMessage content={msg.content} isOutbound={isOutbound} />
                          ) : msg.content?.text ? (
                            // INTERACTIVE (botão/lista clicados), SYSTEM e
                            // qualquer tipo novo: o backend sempre entrega uma
                            // versão legível em content.text. Mostrar isso é
                            // melhor que a etiqueta crua "[INTERACTIVE]".
                            <MessageText
                              text={msg.content.text}
                              isOutbound={isOutbound}
                              mentionNames={mentionNames}
                            />
                          ) : (
                            <p className="text-sm italic opacity-70">
                              Mensagem não suportada
                            </p>
                          )}
                          <div
                            className={`mt-1 flex items-center gap-1 text-[10px] ${
                              isOutbound ? 'justify-end opacity-70' : 'text-zinc-400'
                            }`}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span title={statusTooltip(msg.status, msg.failedReason)}>
                                <StatusIcon
                                  className={`h-3 w-3 ${
                                    msg.status === 'FAILED'
                                      ? 'text-red-300'
                                      : msg.status === 'READ'
                                        ? 'text-blue-300'
                                        : ''
                                  }`}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {reactions.length > 0 && (
                        <div className={`absolute -bottom-2 ${isOutbound ? 'right-2' : 'left-2'} flex gap-0.5`}>
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-zinc-700">
                            {[...new Set(reactions)].join('')}
                            {reactions.length > 1 && (
                              <span className="ml-0.5 text-[10px] text-zinc-400">{reactions.length}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isOutbound && !isRevoked && (
                      <div className="flex items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startReply(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:text-zinc-100"
                          title="Responder"
                          aria-label="Responder esta mensagem"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startForward(msg)}
                          className="rounded-full bg-white p-1.5 text-zinc-400 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:ring-zinc-700 dark:hover:text-zinc-100"
                          title="Encaminhar"
                          aria-label="Encaminhar esta mensagem"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              });
            })()}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {replyingTo && (
        <ReplyPreviewBar
          message={replyingTo}
          onCancel={cancelReply}
          mentionNames={mentionNames}
        />
      )}
      <ChatInput
        onSend={handleSend}
        onSendAudio={handleSendAudio}
        onSendFile={handleSendFile}
        disabled={conversation.status === 'CLOSED'}
        participants={participants}
      />
      <ForwardMessageDialog
        message={forwardingMessage}
        originChannel={conversation.channel}
        onClose={() => setForwardingMessage(null)}
      />
    </div>
  );
}

/**
 * Barra fina logo acima do ChatInput mostrando que estamos compondo uma
 * resposta a uma mensagem específica. X cancela. Replica o visual do
 * WhatsApp Web — borda colorida à esquerda + sender + preview truncado.
 */
function ReplyPreviewBar({
  message,
  onCancel,
  mentionNames,
}: {
  message: Message;
  onCancel: () => void;
  mentionNames?: Map<string, string>;
}) {
  // Em grupo o remetente pode chegar como telefone; o mapa de participantes
  // resolve pro nome, e sem match preferimos "Cliente" a um número cru.
  const rawSender =
    message.direction === 'OUTBOUND'
      ? message.sender?.name || 'Você'
      : (message.senderName ?? 'Cliente');
  const sender = /^\+?\d[\d\s()-]*$/.test(rawSender)
    ? (mentionNames?.get(rawSender.replace(/\D/g, '')) ?? 'Cliente')
    : rawSender;
  const c = (message.content ?? {}) as Record<string, any>;
  const preview = humanizeMentions(
    (typeof c.text === 'string' && c.text) ||
      (typeof c.caption === 'string' && c.caption) ||
      `[${(message.type || 'mensagem').toLowerCase()}]`,
    mentionNames,
  );
  return (
    <div className="flex items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
        <p className="text-xs font-medium text-primary">Respondendo {sender}</p>
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
          {preview}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        aria-label="Cancelar resposta"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
