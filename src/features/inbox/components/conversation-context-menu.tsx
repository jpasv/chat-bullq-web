'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Tag as TagIcon,
  MessageSquare,
  User,
  ChevronRight,
  ArrowLeft,
  Check,
  Loader2,
  KanbanSquare,
  Archive,
  ArchiveRestore,
  Inbox as InboxIcon,
  Filter,
  Pencil,
  Mail,
  Clock,
  CircleCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { tagsService, type Tag } from '@/features/settings/services/tags.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { pipelinesService } from '@/features/pipelines/services/pipelines.service';
import { inboxViewsService, type InboxView } from '@/features/inbox-views/services/inbox-views.service';
import { inboxService } from '../services/inbox.service';
import type { Conversation } from '../services/inbox.service';
import { RenameConversationDialog } from './rename-conversation-dialog';

type Target = 'conversation' | 'contact';

interface ConversationContextMenuProps {
  conversation: Conversation;
  position: { x: number; y: number };
  onClose: () => void;
}

const MENU_WIDTH = 224;
const MENU_MAX_HEIGHT = 360;

export function ConversationContextMenu({
  conversation,
  position,
  onClose,
}: ConversationContextMenuProps) {
  const queryClient = useQueryClient();
  const orgId = useOrgId();
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'root' | Target | 'pipeline' | 'inbox-views'>('root');
  const [pendingTagId, setPendingTagId] = useState<string | null>(null);
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);
  const [pendingViewId, setPendingViewId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);
  const [settingWaiting, setSettingWaiting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const isArchived = (conversation as any).isArchived === true;
  const isWaiting = conversation.awaitingHumanReply === true;
  const alreadyUnread = (conversation.unreadCount ?? 0) > 0;

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', orgId],
    queryFn: () => tagsService.list(),
  });

  // Pipelines lazy-loaded only when the user opens the "Adicionar a pipeline"
  // submenu — avoids hitting /pipelines on every right-click.
  const { data: pipelines = [], isLoading: pipelinesLoading } = useQuery({
    queryKey: ['pipelines', orgId],
    queryFn: () => pipelinesService.list(),
    enabled: view === 'pipeline',
  });

  // Inbox views (custom inboxes pinadas pelo usuário). Lazy também — só
  // carrega quando o submenu "Adicionar a inbox" abre. Filtramos as views
  // builtin (Archived) — não faz sentido pinar manualmente uma conversa
  // numa view de filtro automático ortogonal a essa ação.
  const { data: inboxViewsRaw = [], isLoading: inboxViewsLoading } = useQuery({
    queryKey: ['inbox-views', orgId],
    queryFn: () => inboxViewsService.list(),
    enabled: view === 'inbox-views',
  });
  const inboxViews = useMemo(
    () => inboxViewsRaw.filter((v) => v.metadata?.builtin !== true),
    [inboxViewsRaw],
  );
  const pinnedViewIds = useMemo(() => {
    const set = new Set<string>();
    for (const v of inboxViewsRaw) {
      const ids = v.filters?.conversationIds ?? [];
      if (ids.includes(conversation.id)) set.add(v.id);
    }
    return set;
  }, [inboxViewsRaw, conversation.id]);

  const appliedConversation = useMemo(
    () => new Set((conversation.tags ?? []).map((t) => t.tag.id)),
    [conversation.tags],
  );
  const appliedContact = useMemo(
    () => new Set((conversation.contact.tags ?? []).map((t) => t.tag.id)),
    [conversation.contact.tags],
  );

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleContext = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('contextmenu', handleContext);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('contextmenu', handleContext);
    };
  }, [onClose]);

  // Clamp position to viewport
  const clampedPos = useMemo(() => {
    if (typeof window === 'undefined') return position;
    const maxX = window.innerWidth - MENU_WIDTH - 8;
    const maxY = window.innerHeight - MENU_MAX_HEIGHT - 8;
    return {
      x: Math.min(position.x, maxX),
      y: Math.min(position.y, maxY),
    };
  }, [position]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
  };

  const toggleInboxView = async (target: InboxView) => {
    const isPinned = pinnedViewIds.has(target.id);
    setPendingViewId(target.id);
    try {
      const currentIds = target.filters?.conversationIds ?? [];
      const nextIds = isPinned
        ? currentIds.filter((id) => id !== conversation.id)
        : Array.from(new Set([...currentIds, conversation.id]));
      await inboxViewsService.update(target.id, {
        filters: { ...target.filters, conversationIds: nextIds },
      });
      toast.success(
        isPinned
          ? `Removida de "${target.name}"`
          : `Adicionada a "${target.name}"`,
      );
      queryClient.invalidateQueries({ queryKey: ['inbox-views'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          (isPinned ? 'Erro ao remover da inbox' : 'Erro ao adicionar à inbox'),
      );
    } finally {
      setPendingViewId(null);
    }
  };

  const markUnread = async () => {
    setMarkingUnread(true);
    try {
      const result = await inboxService.markAsUnread(conversation.id);
      // Optimistically bump the badge in cached list pages — the socket
      // event (conversation:unread) will reconcile if the count differs.
      queryClient.setQueriesData<any>(
        { queryKey: ['conversations'] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              conversations: p.conversations.map((c: any) =>
                c.id === conversation.id
                  ? { ...c, unreadCount: result.unreadCount || 1 }
                  : c,
              ),
            })),
          };
        },
      );
      toast.success('Marcada como não-lida');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao marcar como não-lida');
    } finally {
      setMarkingUnread(false);
    }
  };

  const toggleArchive = async () => {
    setArchiving(true);
    try {
      if (isArchived) {
        await inboxService.unarchive(conversation.id);
        toast.success('Conversa desarquivada');
      } else {
        await inboxService.archive(conversation.id);
        toast.success('Conversa arquivada');
      }
      invalidate();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao arquivar');
    } finally {
      setArchiving(false);
    }
  };

  const toggleWaiting = async () => {
    setSettingWaiting(true);
    try {
      await inboxService.setWaiting(conversation.id, !isWaiting);
      toast.success(
        isWaiting ? 'Retirada do esperando' : 'Colocada no esperando',
      );
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['conversation-tab-counts'] });
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          (isWaiting
            ? 'Erro ao retirar do esperando'
            : 'Erro ao colocar no esperando'),
      );
    } finally {
      setSettingWaiting(false);
    }
  };

  const addToPipeline = async (pipelineId: string, pipelineName: string) => {
    setPendingPipelineId(pipelineId);
    try {
      await pipelinesService.createCard(pipelineId, {
        conversationId: conversation.id,
      });
      toast.success(`Adicionada ao pipeline "${pipelineName}"`);
      queryClient.invalidateQueries({ queryKey: ['pipeline-board', pipelineId] });
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Erro ao adicionar ao pipeline',
      );
    } finally {
      setPendingPipelineId(null);
    }
  };

  const toggleTag = async (tag: Tag, target: Target) => {
    const applied = target === 'conversation' ? appliedConversation : appliedContact;
    const isOn = applied.has(tag.id);
    setPendingTagId(tag.id);
    try {
      if (target === 'conversation') {
        if (isOn) await tagsService.removeFromConversation(conversation.id, tag.id);
        else await tagsService.addToConversation(conversation.id, tag.id);
      } else {
        if (isOn) await tagsService.removeFromContact(conversation.contact.id, tag.id);
        else await tagsService.addToContact(conversation.contact.id, tag.id);
      }
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar tag');
    } finally {
      setPendingTagId(null);
    }
  };

  return (
    <div
      ref={ref}
      style={{ top: clampedPos.y, left: clampedPos.x, width: MENU_WIDTH }}
      className="fixed z-50 rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900"
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === 'root' && (
        <>
          <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Atribuir tag
          </div>
          <button
            onClick={() => setView('conversation')}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1">Na conversa</span>
            {appliedConversation.size > 0 && (
              <span className="text-[10px] font-medium text-primary">
                {appliedConversation.size}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </button>
          <button
            onClick={() => setView('contact')}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <User className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1">No contato</span>
            {appliedContact.size > 0 && (
              <span className="text-[10px] font-medium text-primary">
                {appliedContact.size}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />

          <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Organizar
          </div>
          <button
            onClick={() => setView('inbox-views')}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <InboxIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1">Adicionar a inbox</span>
            {pinnedViewIds.size > 0 && (
              <span className="text-[10px] font-medium text-primary">
                {pinnedViewIds.size}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </button>
          <button
            onClick={() => setView('pipeline')}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <KanbanSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1">Adicionar a pipeline</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </button>

          <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />

          <button
            onClick={() => setRenameOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="flex-1">Renomear</span>
          </button>
          <button
            onClick={markUnread}
            disabled={markingUnread || alreadyUnread}
            title={alreadyUnread ? 'Conversa já está como não-lida' : undefined}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            {markingUnread ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
            ) : (
              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
            <span className="flex-1">Marcar como não-lida</span>
          </button>
          <button
            onClick={toggleWaiting}
            disabled={settingWaiting}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            {settingWaiting ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
            ) : isWaiting ? (
              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            ) : (
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
            <span className="flex-1">
              {isWaiting ? 'Retirar do esperando' : 'Colocar no esperando'}
            </span>
          </button>
          <button
            onClick={toggleArchive}
            disabled={archiving}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            {archiving ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
            ) : isArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            ) : (
              <Archive className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
            <span className="flex-1">{isArchived ? 'Desarquivar' : 'Arquivar'}</span>
          </button>
        </>
      )}

      {view === 'inbox-views' && (
        <>
          <button
            onClick={() => setView('root')}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:bg-zinc-50 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
          >
            <ArrowLeft className="h-3 w-3" />
            Adicionar a inbox
          </button>
          <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <div
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: MENU_MAX_HEIGHT - 80 }}
          >
            {inboxViewsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
              </div>
            ) : inboxViews.length === 0 ? (
              <div className="flex flex-col items-center px-3 py-4 text-center">
                <InboxIcon className="h-5 w-5 text-zinc-300 dark:text-zinc-700" />
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  Nenhuma inbox personalizada
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  Crie uma na sidebar (Inbox › Nova inbox) ou via "criar inbox da seleção"
                </p>
              </div>
            ) : (
              inboxViews.map((v) => {
                const isPinned = pinnedViewIds.has(v.id);
                const isPending = pendingViewId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleInboxView(v)}
                    disabled={isPending}
                    className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                    title={
                      isPinned
                        ? `Remover de "${v.name}"`
                        : `Adicionar a "${v.name}"`
                    }
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    <span className="flex-1 truncate">{v.name}</span>
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    ) : isPinned ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary group-hover:hidden" />
                        <X className="hidden h-3.5 w-3.5 text-red-500 group-hover:block" />
                      </>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      {view === 'pipeline' && (
        <>
          <button
            onClick={() => setView('root')}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:bg-zinc-50 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
          >
            <ArrowLeft className="h-3 w-3" />
            Adicionar a pipeline
          </button>
          <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <div
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: MENU_MAX_HEIGHT - 80 }}
          >
            {pipelinesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
              </div>
            ) : pipelines.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <KanbanSquare className="h-5 w-5 text-zinc-300 dark:text-zinc-700" />
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  Nenhum pipeline
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  Crie em /pipelines
                </p>
              </div>
            ) : (
              pipelines.map((p) => {
                const isPending = pendingPipelineId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToPipeline(p.id, p.name)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                  >
                    <KanbanSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      {(view === 'conversation' || view === 'contact') && (
        <>
          <button
            onClick={() => setView('root')}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:bg-zinc-50 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
          >
            <ArrowLeft className="h-3 w-3" />
            {view === 'conversation' ? 'Tags da conversa' : 'Tags do contato'}
          </button>
          <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <div
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: MENU_MAX_HEIGHT - 80 }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
              </div>
            ) : tags.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <TagIcon className="h-5 w-5 text-zinc-300 dark:text-zinc-700" />
                <p className="mt-1.5 text-[11px] text-zinc-400">Nenhuma tag</p>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  Crie em Configurações › Tags
                </p>
              </div>
            ) : (
              tags.map((tag) => {
                const applied =
                  view === 'conversation' ? appliedConversation : appliedContact;
                const isOn = applied.has(tag.id);
                const isPending = pendingTagId === tag.id;
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag, view)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    ) : isOn ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      <RenameConversationDialog
        conversation={conversation}
        open={renameOpen}
        onClose={() => {
          setRenameOpen(false);
          onClose();
        }}
      />
    </div>
  );
}
