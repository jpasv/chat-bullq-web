'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  XCircle,
  RotateCcw,
  RefreshCw,
  MessageSquare,
  Instagram,
  Phone,
  Mail,
  Send,
  Activity,
  FolderKanban,
  GraduationCap,
} from 'lucide-react';
import { ConversationAiToggle } from './conversation-ai-toggle';
import { AssignmentPopover } from './assignment-popover';
import { AgentPinPopover } from './agent-pin-popover';
import { PipelinePopover } from './pipeline-popover';
import { inboxService, type Conversation } from '../services/inbox.service';

interface ConversationHeaderProps {
  conversation: Conversation;
  onUpdate: () => void;
  /** When provided, renders a toggle button for the agent-runs sidebar. */
  onToggleAgentLogs?: () => void;
  agentLogsOpen?: boolean;
  /** When provided + conversation is a group, renders the Project panel toggle. */
  onToggleProject?: () => void;
  projectOpen?: boolean;
}

function ChannelBadge({ type, name }: { type: string; name: string }) {
  const t = type.toUpperCase();
  const isWhats = t.includes('WHATSAPP') || t.includes('ZAPPFY');
  const isInsta = t.includes('INSTAGRAM');
  const isTelegram = t.includes('TELEGRAM');
  const isEmail = t.includes('EMAIL') || t.includes('MAIL');
  const isSms = t.includes('SMS');
  const isMembers = t === 'MEMBERS';

  let Icon = MessageSquare;
  let label = 'Chat';
  let cls =
    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';

  if (isMembers) {
    Icon = GraduationCap;
    label = 'Área de membros';
    cls = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
  } else if (isWhats) {
    Icon = Phone;
    label = 'WhatsApp';
    cls = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  } else if (isInsta) {
    Icon = Instagram;
    label = 'Instagram';
    cls = 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
  } else if (isTelegram) {
    Icon = Send;
    label = 'Telegram';
    cls = 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
  } else if (isEmail) {
    Icon = Mail;
    label = 'Email';
    cls = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  } else if (isSms) {
    Icon = MessageSquare;
    label = 'SMS';
    cls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  }

  return (
    <span
      title={name}
      className={`mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
      <span className="font-normal normal-case opacity-70">· {name}</span>
    </span>
  );
}

function HeaderAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name?.slice(0, 2).toUpperCase() || '??';
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {initials}
    </div>
  );
}

export function ConversationHeader({
  conversation,
  onUpdate,
  onToggleAgentLogs,
  agentLogsOpen,
  onToggleProject,
  projectOpen,
}: ConversationHeaderProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await inboxService.syncConversation(conversation.id);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['messages', conversation.id] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }),
      ]);
      if (result.imported > 0) {
        toast.success(
          `${result.imported} ${result.imported === 1 ? 'mensagem nova' : 'mensagens novas'} sincronizada${result.imported === 1 ? '' : 's'}`,
        );
      } else {
        toast.success('Tudo em dia — nenhuma mensagem nova');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  };
  const handleAction = async (action: () => Promise<any>, successMsg: string) => {
    setIsLoading(true);
    try {
      await action();
      toast.success(successMsg);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <HeaderAvatar
          name={conversation.contact.name}
          avatarUrl={conversation.contact.avatarUrl}
        />
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {conversation.contact.name || conversation.contact.phone || 'Desconhecido'}
          </div>
          {conversation.contact.phone && conversation.contact.name && (
            <div className="text-xs text-zinc-500">{conversation.contact.phone}</div>
          )}
          <ChannelBadge
            type={conversation.channel.type}
            name={conversation.channel.name}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <AgentPinPopover conversation={conversation} onChanged={onUpdate} />
        <ConversationAiToggle
          conversation={conversation}
          disabled={isLoading}
          onChange={async (next) => {
            await handleAction(
              () => inboxService.toggleAi(conversation.id, next),
              next === null
                ? 'IA voltou pro padrão (segue config global)'
                : next
                  ? 'IA forçada nesta conversa (sobrepõe global)'
                  : 'IA pausada nesta conversa',
            );
          }}
          onEngage={async () => {
            await handleAction(async () => {
              const result = await inboxService.engageAi(conversation.id);
              if (!result.engaged) {
                throw new Error(
                  result.reason
                    ? `IA não pôde engajar: ${result.reason}`
                    : 'Não foi possível engajar a IA',
                );
              }
              return result;
            }, 'IA engajada — vai responder em segundos');
          }}
        />
        <button
          onClick={handleSync}
          disabled={isSyncing}
          title="Sincronizar mensagens"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
        {onToggleProject && conversation.isGroup && (
          <button
            onClick={onToggleProject}
            title={projectOpen ? 'Fechar projeto' : 'Abrir projeto'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              projectOpen
                ? 'bg-primary/10 text-primary dark:bg-primary/15'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
          </button>
        )}
        {onToggleAgentLogs && (
          <button
            onClick={onToggleAgentLogs}
            title={agentLogsOpen ? 'Fechar logs do agente' : 'Abrir logs do agente'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              agentLogsOpen
                ? 'bg-primary/10 text-primary dark:bg-primary/15'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
          </button>
        )}
        {conversation.status !== 'CLOSED' && (
          <AssignmentPopover
            conversation={conversation}
            onChanged={onUpdate}
          />
        )}
        <PipelinePopover conversation={conversation} onChanged={onUpdate} />
        {conversation.status !== 'CLOSED' && (
          <button
            onClick={() =>
              handleAction(
                () => inboxService.closeConversation(conversation.id),
                'Conversa encerrada',
              )
            }
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <XCircle className="h-3.5 w-3.5" />
            Encerrar
          </button>
        )}
        {conversation.status === 'CLOSED' && (
          <button
            onClick={() =>
              handleAction(
                () => inboxService.reopenConversation(conversation.id),
                'Conversa reaberta',
              )
            }
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reabrir
          </button>
        )}
      </div>
    </div>
  );
}
