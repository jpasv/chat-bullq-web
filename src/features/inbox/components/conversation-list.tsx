'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  Search,
  X,
  SlidersHorizontal,
  Check,
  UserCheck,
  XCircle,
  RotateCcw,
  Loader2,
  ChevronDown,
  Inbox,
  Users,
  User,
  FolderPlus,
  MailOpen,
  Archive,
  Pin,
  Tag as TagIcon,
  Layers,
  FolderKanban,
  MessageSquarePlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';
import { inboxService, type Conversation } from '../services/inbox.service';
import {
  inboxViewsService,
  type InboxView,
} from '@/features/inbox-views/services/inbox-views.service';
import { channelsService } from '@/features/channels/services/channels.service';
import { segmentsService } from '@/features/segments/services/segments.service';
import { PROJECT_STATUSES } from '@/features/projects/project-fields';
import { tagsService } from '@/features/settings/services/tags.service';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon } from '@/components/ui/icons';
import { useOrgId } from '@/hooks/use-org-query-key';
import { useSocket } from '../hooks/use-socket';
import { useAuthStore } from '@/stores/auth-store';
import { useInboxPreferences } from '../hooks/use-inbox-preferences';
import { ConversationContextMenu } from './conversation-context-menu';
import { NewConversationDialog } from './new-conversation-dialog';
import { BulkAiPopover } from './bulk-ai-popover';
import { BulkPipelinePopover } from './bulk-pipeline-popover';
import { pipelinesService } from '@/features/pipelines/services/pipelines.service';

function ListAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name?.slice(0, 2).toUpperCase() || '??';
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        onError={() => setFailed(true)}
        className="h-10 w-10 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-[13px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      {initials}
    </div>
  );
}

type ScopeFilter = 'ALL' | 'MINE';

const scopeOptions: { label: string; value: ScopeFilter; icon: React.ElementType }[] = [
  { label: 'Todas as conversas', value: 'ALL', icon: Users },
  { label: 'Minhas conversas', value: 'MINE', icon: User },
];

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  GMAIL: GmailIcon,
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-400',
  OPEN: 'bg-emerald-400',
  BOT: 'bg-blue-400',
  WAITING: 'bg-violet-400',
  CLOSED: 'bg-zinc-300 dark:bg-zinc-600',
};

type ListFilter = 'unread' | 'archived' | 'groups';

const filterOptions: { label: string; value: ListFilter; icon: React.ElementType; description: string }[] = [
  {
    label: 'Não lidas',
    value: 'unread',
    icon: MailOpen,
    description: 'Apenas com mensagens novas',
  },
  {
    label: 'Arquivadas',
    value: 'archived',
    icon: Archive,
    description: 'Mostra a inbox arquivada',
  },
  {
    label: 'Grupos',
    value: 'groups',
    icon: Users,
    description: 'Inclui conversas de grupos. Desmarcado = esconde.',
  },
];

interface ConversationListProps {
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  /**
   * When set, fetches conversations through the inbox view endpoint
   * (`/inbox-views/:id/conversations`) which applies the view's saved
   * filters server-side. The user's local filters (status/channel/scope)
   * still layer on top via query params.
   */
  viewId?: string | null;
}

export function ConversationList({ activeId, onSelect, viewId }: ConversationListProps) {
  const queryClient = useQueryClient();
  const orgId = useOrgId();
  const { on, onReconnect } = useSocket();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const {
    preferences: savedPrefs,
    isLoaded: prefsLoaded,
    update: updatePrefs,
  } = useInboxPreferences();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  // Default false = grupos NÃO aparecem no inbox geral (regra do JP).
  // Toggle pra true exibe junto com individuais.
  const [showGroups, setShowGroups] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedProjectStatus, setSelectedProjectStatus] = useState('');
  const [mineProjects, setMineProjects] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  // showGroups conta como filtro ativo SÓ quando ON (default OFF é o
  // comportamento padrão, não merece badge). Tags contam 1 por tag.
  const activeFilterCount =
    (unreadOnly ? 1 : 0) +
    (archivedOnly ? 1 : 0) +
    (showGroups ? 1 : 0) +
    (selectedProjectStatus ? 1 : 0) +
    (mineProjects ? 1 : 0) +
    selectedTagIds.length;
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const hydratedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    conversation: Conversation;
    position: { x: number; y: number };
  } | null>(null);
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  // Hydrate state from saved preferences once they load
  useEffect(() => {
    if (!prefsLoaded || hydratedRef.current) return;
    hydratedRef.current = true;
    if (savedPrefs.scope === 'MINE' || savedPrefs.scope === 'ALL') {
      setScope(savedPrefs.scope);
    }
    if (typeof savedPrefs.unreadOnly === 'boolean') {
      setUnreadOnly(savedPrefs.unreadOnly);
    }
    if (typeof savedPrefs.archivedOnly === 'boolean') {
      setArchivedOnly(savedPrefs.archivedOnly);
    }
    if (typeof savedPrefs.showGroups === 'boolean') {
      setShowGroups(savedPrefs.showGroups);
    }
    if (savedPrefs.selectedChannelId !== undefined) {
      setSelectedChannelId(savedPrefs.selectedChannelId ?? null);
    }
    if (savedPrefs.selectedSegmentId !== undefined) {
      setSelectedSegmentId(savedPrefs.selectedSegmentId ?? null);
    }
    if (typeof savedPrefs.selectedProjectStatus === 'string') {
      setSelectedProjectStatus(savedPrefs.selectedProjectStatus);
    }
    if (typeof savedPrefs.mineProjects === 'boolean') {
      setMineProjects(savedPrefs.mineProjects);
    }
    if (Array.isArray(savedPrefs.tagIds)) {
      setSelectedTagIds(savedPrefs.tagIds);
    }
  }, [prefsLoaded, savedPrefs]);

  const toggleListFilter = useCallback(
    (value: ListFilter) => {
      if (value === 'unread') {
        setUnreadOnly((v) => {
          const next = !v;
          updatePrefs({ unreadOnly: next });
          return next;
        });
      } else if (value === 'archived') {
        setArchivedOnly((v) => {
          const next = !v;
          updatePrefs({ archivedOnly: next });
          return next;
        });
      } else if (value === 'groups') {
        setShowGroups((v) => {
          const next = !v;
          updatePrefs({ showGroups: next });
          return next;
        });
      }
    },
    [updatePrefs],
  );

  const clearListFilters = useCallback(() => {
    setUnreadOnly(false);
    setArchivedOnly(false);
    setShowGroups(false);
    setSelectedTagIds([]);
    setSelectedProjectStatus('');
    setMineProjects(false);
    updatePrefs({
      unreadOnly: false,
      archivedOnly: false,
      showGroups: false,
      tagIds: [],
      selectedProjectStatus: '',
      mineProjects: false,
    });
  }, [updatePrefs]);

  const handleProjectStatusChange = useCallback(
    (value: string) => {
      setSelectedProjectStatus(value);
      updatePrefs({ selectedProjectStatus: value });
    },
    [updatePrefs],
  );

  const toggleMineProjects = useCallback(() => {
    setMineProjects((v) => {
      const next = !v;
      updatePrefs({ mineProjects: next });
      return next;
    });
  }, [updatePrefs]);

  const toggleTagFilter = useCallback(
    (tagId: string) => {
      setSelectedTagIds((prev) => {
        const next = prev.includes(tagId)
          ? prev.filter((id) => id !== tagId)
          : [...prev, tagId];
        updatePrefs({ tagIds: next });
        return next;
      });
    },
    [updatePrefs],
  );

  const handleScopeChange = useCallback(
    (next: ScopeFilter) => {
      setScope(next);
      updatePrefs({ scope: next });
    },
    [updatePrefs],
  );

  const handleChannelChange = useCallback(
    (next: string | null) => {
      // Canal e segmento são mutuamente exclusivos no seletor.
      setSelectedChannelId(next);
      setSelectedSegmentId(null);
      updatePrefs({ selectedChannelId: next, selectedSegmentId: null });
    },
    [updatePrefs],
  );

  const handleSegmentChange = useCallback(
    (next: string | null) => {
      setSelectedSegmentId(next);
      setSelectedChannelId(null);
      updatePrefs({ selectedSegmentId: next, selectedChannelId: null });
    },
    [updatePrefs],
  );

  const tagsKey = useMemo(
    () => [...selectedTagIds].sort().join(','),
    [selectedTagIds],
  );
  const filterKey = `${unreadOnly ? 'u' : ''}|${archivedOnly ? 'a' : ''}|${showGroups ? 'g' : ''}|ps:${selectedProjectStatus}|mp:${mineProjects ? '1' : ''}|t:${tagsKey}`;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', orgId],
    queryFn: () => tagsService.list(),
  });

  const { data: segments = [] } = useQuery({
    queryKey: ['segments', orgId],
    queryFn: () => segmentsService.list(),
  });

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, tagSearch]);

  // Drop selected tag ids that no longer exist (tag deleted in another tab).
  // Avoid sending stale ids to the backend — they'd just match nothing.
  useEffect(() => {
    if (!tags.length || !selectedTagIds.length) return;
    const valid = new Set(tags.map((t) => t.id));
    const filtered = selectedTagIds.filter((id) => valid.has(id));
    if (filtered.length !== selectedTagIds.length) {
      setSelectedTagIds(filtered);
      updatePrefs({ tagIds: filtered });
    }
  }, [tags, selectedTagIds, updatePrefs]);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId],
  );

  // Reset scroll when filters/search change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [filterKey, debouncedSearch, selectedChannelId, selectedSegmentId, scope, showGroups, tagsKey]);

  // Filtros que unificam por grupo (segmento OU projeto) — são sempre
  // grupos: força groups=only e ignora o filtro de canal. Segmento tem
  // precedência se ambos estiverem ativos.
  const hasProjectFilter =
    !!selectedProjectStatus || (mineProjects && !!currentUserId);

  // Params compartilhados entre a lista paginada e a seção "Fixadas" — os
  // dois precisam respeitar exatamente os mesmos filtros (busca, canal,
  // tags, grupos, não lidas) pra não divergir.
  const buildListParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    if (unreadOnly) params.unread = 'true';
    // archived: dentro de view, só passa quando user explicitamente
    // ativou (override). Fora de view, passa sempre o estado atual.
    if (viewId) {
      if (archivedOnly) params.archived = 'only';
    } else {
      params.archived = archivedOnly ? 'only' : 'exclude';
    }
    if (selectedSegmentId) {
      params.segmentId = selectedSegmentId;
      params.groups = 'only';
    } else if (hasProjectFilter) {
      if (selectedProjectStatus) params.projectStatus = selectedProjectStatus;
      if (mineProjects && currentUserId)
        params.responsibleUserId = currentUserId;
      params.groups = 'only';
    } else {
      // groups: dentro de view, só override se user MARCOU "Grupos"
      // explicitamente (vira 'only' pra forçar). Fora de view, default
      // esconde grupos (regra do JP).
      if (viewId) {
        if (showGroups) params.groups = 'only';
      } else {
        if (!showGroups) params.groups = 'exclude';
      }
      if (selectedChannelId) params.channelId = selectedChannelId;
    }
    if (debouncedSearch) params.search = debouncedSearch;
    if (selectedTagIds.length > 0) params.tagIds = selectedTagIds.join(',');
    if (scope === 'MINE' && currentUserId) params.assignedToId = currentUserId;
    return params;
  }, [
    unreadOnly,
    archivedOnly,
    viewId,
    selectedSegmentId,
    hasProjectFilter,
    selectedProjectStatus,
    mineProjects,
    currentUserId,
    showGroups,
    selectedChannelId,
    debouncedSearch,
    selectedTagIds,
    scope,
  ]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['conversations', orgId, viewId ?? null, filterKey, debouncedSearch, selectedChannelId, selectedSegmentId, scope, currentUserId],
    queryFn: ({ pageParam = 1 }) => {
      const params: Record<string, string> = {
        limit: '30',
        page: String(pageParam),
        ...buildListParams(),
      };
      if (viewId) {
        return inboxViewsService.getConversations(viewId, params);
      }
      return inboxService.getConversations(params);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    // Realtime (message:new / conversation:updated) drives updates — keep a
    // slow safety-net poll to cover transient socket drops.
    refetchInterval: 60000,
    staleTime: 15000,
  });

  const conversations = useMemo(
    () => data?.pages.flatMap((p) => p.conversations) || [],
    [data],
  );

  // Seção "Fixadas" (per-user) — só na inbox padrão: fora de views
  // customizadas, sem filtro de segmento/projeto (esses resolvem
  // conversationIds por conta própria) e nunca dentro do filtro
  // "Arquivadas" (arquivar vence sobre fixar).
  const pinnedEnabled =
    !viewId && !selectedSegmentId && !hasProjectFilter && !archivedOnly && !!currentUserId;

  const { data: pinnedData } = useQuery({
    queryKey: [
      'conversations-pinned',
      orgId,
      filterKey,
      debouncedSearch,
      selectedChannelId,
      scope,
      currentUserId,
    ],
    queryFn: () => inboxService.getPinnedConversations(buildListParams()),
    enabled: pinnedEnabled,
    staleTime: 15000,
  });
  const pinnedConversations = pinnedData?.conversations ?? [];

  // Total count from the paginated response — same value across pages
  // (it's the count(where) from Postgres). Fixadas saem dessa contagem por
  // construção (a lista paginada as exclui), então somamos de volta quando
  // "Não lidas" está ativo — nesse estado a seção fixa só retorna itens não
  // lidos (buildListParams já propaga `unread=true` pra ela também).
  const totalCount =
    (data?.pages?.[0]?.pagination?.total ?? 0) +
    (unreadOnly ? pinnedConversations.length : 0);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  }, []);

  const handleConversationClick = useCallback(
    (conv: Conversation, index: number, e: React.MouseEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (lastClickedIndex !== null && conversations.length > 0) {
            const start = Math.min(lastClickedIndex, index);
            const end = Math.max(lastClickedIndex, index);
            for (let i = start; i <= end; i++) {
              next.add(conversations[i].id);
            }
          } else {
            next.add(conv.id);
          }
          return next;
        });
        setLastClickedIndex(index);
        return;
      }

      if (selectedIds.size > 0) {
        clearSelection();
      }
      onSelect(conv);
      setLastClickedIndex(index);

      // Mark as read on click. Optimistic: zero the local counter
      // immediately so the badge disappears before the API roundtrip;
      // backend then emits conversation:read via socket which becomes
      // a no-op for this user (counter is already 0) but syncs other
      // tabs/devices logged into the same account.
      if ((conv.unreadCount ?? 0) > 0) {
        const lastMsgId = conv.messages?.[0]?.id;

        // When the current list filters by "unread only" — either via the
        // local toggle on the main inbox or via a saved view that pins
        // unreadOnly — the conversation we just opened is no longer a
        // member of the filtered set. Optimistically drop it from the
        // cached pages so the user sees it leave immediately, instead of
        // waiting for the next refetch.
        let dropFromList = false;
        if (viewId) {
          const cachedViews = queryClient.getQueryData<InboxView[]>([
            'inbox-views',
          ]);
          dropFromList =
            cachedViews?.find((v) => v.id === viewId)?.filters?.unreadOnly ===
            true;
        } else {
          dropFromList = unreadOnly;
        }

        queryClient.setQueriesData<any>(
          { queryKey: ['conversations'] },
          (old: any) => {
            if (!old?.pages) return old;
            return {
              ...old,
              pages: old.pages.map((p: any) => ({
                ...p,
                conversations: dropFromList
                  ? p.conversations.filter(
                      (c: Conversation) => c.id !== conv.id,
                    )
                  : p.conversations.map((c: Conversation) =>
                      c.id === conv.id ? { ...c, unreadCount: 0 } : c,
                    ),
                // Keep `total` honest when dropping — the unread badge in
                // the sidebar reads from it and would otherwise be stale.
                ...(dropFromList && p.pagination
                  ? {
                      pagination: {
                        ...p.pagination,
                        total: Math.max(0, (p.pagination.total ?? 1) - 1),
                      },
                    }
                  : {}),
              })),
            };
          },
        );
        inboxService.markAsRead(conv.id, lastMsgId).catch(() => {
          // Server rejected — refetch to roll back.
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        });
      }
    },
    [
      lastClickedIndex,
      conversations,
      selectedIds.size,
      clearSelection,
      onSelect,
      queryClient,
      orgId,
      viewId,
      unreadOnly,
    ],
  );

  const toggleSelect = useCallback((id: string, index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedIndex(index);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(conversations.map((c) => c.id)));
  }, [conversations]);

  const invalidateConversations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Realtime: refresh list on inbound messages, imported conversations, or
  // state transitions (assign/close/reopen/transfer).
  useEffect(() => {
    const unsubNew = on('message:new', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const unsubImported = on('conversation:imported', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const unsubUpdated = on('conversation:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    // When the same user reads a conversation in another tab/device, zero
    // the badge here too without a full refetch.
    // A foto do contato/grupo chega depois da lista (o backend busca no
    // provider em segundo plano). Trocamos só o avatar da linha, sem
    // refetch: a lista não pisca e a posição do scroll fica onde estava.
    const unsubAvatar = on('contact:avatar', (payload: any) => {
      const contactId = payload?.contactId;
      const avatarUrl = payload?.avatarUrl;
      if (!contactId || !avatarUrl) return;
      queryClient.setQueriesData<any>(
        { queryKey: ['conversations'] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              conversations: p.conversations.map((c: Conversation) =>
                c.contact?.id === contactId
                  ? { ...c, contact: { ...c.contact, avatarUrl } }
                  : c,
              ),
            })),
          };
        },
      );
    });
    const unsubRead = on('conversation:read', (payload: any) => {
      const id = payload?.conversationId;
      if (!id) return;
      queryClient.setQueriesData<any>(
        { queryKey: ['conversations'] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              conversations: p.conversations.map((c: Conversation) =>
                c.id === id ? { ...c, unreadCount: 0 } : c,
              ),
            })),
          };
        },
      );
    });
    // Mirror of conversation:read for the "mark as unread" action — keeps
    // other tabs/devices for the same user in sync with the new badge.
    const unsubUnread = on('conversation:unread', (payload: any) => {
      const id = payload?.conversationId;
      if (!id) return;
      const count = Number(payload?.unreadCount) || 1;
      queryClient.setQueriesData<any>(
        { queryKey: ['conversations'] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              conversations: p.conversations.map((c: Conversation) =>
                c.id === id ? { ...c, unreadCount: count } : c,
              ),
            })),
          };
        },
      );
      // Refetch so the conversation re-enters an "unread only" view it
      // had previously dropped from.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    // Sincroniza o pin entre abas/dispositivos do mesmo usuário (emitido
    // via emitToUser, então só chega pra quem fixou/desfixou).
    const unsubPin = on('conversation:pin-updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations-pinned'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    // Reconnect: any events that fired while we were offline are gone, so
    // sync the list from scratch when the socket comes back.
    const unsubReconnect = onReconnect(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations-pinned'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-views'] });
    });
    return () => {
      unsubNew?.();
      unsubImported?.();
      unsubUpdated?.();
      unsubAvatar?.();
      unsubRead?.();
      unsubUnread?.();
      unsubPin?.();
      unsubReconnect?.();
    };
  }, [on, onReconnect, queryClient]);

  const reportBulkResult = useCallback((result: import('../services/inbox.service').BulkResult) => {
    setSelectedIds(new Set(result.failed.map((failure) => failure.conversationId)));
    const message = `${result.succeeded.length} de ${result.succeeded.length + result.failed.length} concluídas`;
    if (result.failed.length) toast.warning(`${message}. As que falharam continuam selecionadas; tente novamente.`);
    else toast.success(message);
  }, []);

  const handleBulkAction = useCallback(
    async (action: 'close' | 'assign' | 'reopen') => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkLoading(true);
      try {
        const result = action === 'close' ? await inboxService.bulkClose(ids)
          : action === 'assign' ? await inboxService.bulkAssignToMe(ids)
          : await inboxService.bulkReopen(ids);
        reportBulkResult(result);
        invalidateConversations();
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, reportBulkResult, invalidateConversations],
  );

  const handleBulkSetAi = useCallback(
    async (override: boolean | null) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkLoading(true);
      try {
        reportBulkResult(await inboxService.bulkSetAi(ids, override));
        invalidateConversations();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Erro ao alterar IA em massa');
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, reportBulkResult, invalidateConversations],
  );

  const handleBulkEngageAi = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      reportBulkResult(await inboxService.bulkEngageAi(ids));
      invalidateConversations();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao engajar IA');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, reportBulkResult, invalidateConversations]);

  // Bulk: drop selected conversations into a pipeline stage. Each
  // conversation becomes a Card on (pipelineId, stageId). Uses
  // allSettled so a single failure (e.g. duplicate) doesn't abort the
  // batch — toast aggregates the result.
  const handleBulkAddToPipeline = useCallback(
    async (pipelineId: string, stageId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkLoading(true);
      try {
        const results = await Promise.allSettled(
          ids.map((conversationId) =>
            pipelinesService.createCard(pipelineId, {
              conversationId,
              stageId,
            }),
          ),
        );
        reportBulkResult({
          succeeded: ids.filter((_, index) => results[index].status === 'fulfilled'),
          failed: results.flatMap((result, index) => result.status === 'rejected'
            ? [{ conversationId: ids[index], error: result.reason }] : []),
        });
        invalidateConversations();
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, reportBulkResult, invalidateConversations],
  );

  // Bulk: pin the selected conversations into a brand-new inbox view.
  // Asks for the inbox name with a quick prompt (no full dialog overhead),
  // creates the view with conversationIds=selected, then navigates to it.
  const router = useRouter();
  const handleCreateInboxFromSelection = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const defaultName = `Seleção ${new Date().toLocaleDateString('pt-BR')}`;
    const name = window.prompt(
      `Nome da nova inbox (com as ${ids.length} conversas selecionadas):`,
      defaultName,
    );
    if (!name || !name.trim()) return;
    setBulkLoading(true);
    try {
      const view = await inboxViewsService.create({
        name: name.trim(),
        icon: 'Star',
        color: 'amber',
        filters: { conversationIds: ids },
      });
      toast.success(`Inbox "${view.name}" criada com ${ids.length} conversas`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['inbox-views'] });
      router.push(`/inbox?view=${view.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao criar inbox');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, queryClient, router]);

  const getLastMessagePreview = (conv: Conversation) => {
    const last = conv.messages[0];
    if (!last) return 'Sem mensagens';
    const prefix = last.direction === 'OUTBOUND' ? 'Você: ' : '';
    const rt = (last as any).metadata?.replyTo;
    const storyPrefix = rt?.story
      ? rt.story.kind === 'mention'
        ? '📸 Mencionou no story · '
        : '📸 Respondeu seu story · '
      : rt?.ad
        ? '📢 Respondeu ao anúncio · '
        : '';
    return prefix + storyPrefix + (last.content?.text || `[${last.type}]`);
  };

  const formatTime = (date: string | null) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  // Clique numa linha da seção "Fixadas" — não participa de seleção em
  // massa/shift-click (essas linhas ficam fora do array `conversations`,
  // então índices de range-select não fazem sentido pra elas). Só abre a
  // conversa e marca como lida, mesmo efeito colateral de
  // handleConversationClick, só que restrito ao cache de `conversations-pinned`.
  const handlePinnedRowClick = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
      if ((conv.unreadCount ?? 0) > 0) {
        const lastMsgId = conv.messages?.[0]?.id;
        queryClient.setQueriesData<any>(
          { queryKey: ['conversations-pinned'] },
          (old: any) => {
            if (!old?.conversations) return old;
            return {
              ...old,
              conversations: old.conversations.map((c: Conversation) =>
                c.id === conv.id ? { ...c, unreadCount: 0 } : c,
              ),
            };
          },
        );
        inboxService.markAsRead(conv.id, lastMsgId).catch(() => {
          queryClient.invalidateQueries({ queryKey: ['conversations-pinned'] });
        });
      }
    },
    [onSelect, queryClient],
  );

  // Reaproveitado pela lista paginada (selectable=true, participa de
  // seleção em massa) e pela seção "Fixadas" (selectable=false).
  const renderConversationRow = (
    conv: Conversation,
    index: number,
    selectable: boolean,
  ) => {
    const isActive = conv.id === activeId;
    const isSelected = selectable && selectedIds.has(conv.id);
    const inSelectionMode = selectable && selectedIds.size > 0;
    return (
      <button
        key={conv.id}
        onClick={(e) =>
          selectable
            ? handleConversationClick(conv, index, e)
            : handlePinnedRowClick(conv)
        }
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            conversation: conv,
            position: { x: e.clientX, y: e.clientY },
          });
        }}
        className={`group flex w-full gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
          isSelected
            ? 'bg-primary/[0.06] dark:bg-primary/10'
            : isActive
              ? 'bg-primary/[0.06] dark:bg-primary/10'
              : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
        }`}
      >
        <div className="group/avatar relative shrink-0">
          {/* Avatar visível por padrão; some no hover (ou se está selecionado / em selection mode) pra dar lugar à checkbox. */}
          <div
            className={`${
              inSelectionMode || isSelected
                ? 'invisible'
                : 'group-hover/avatar:invisible'
            }`}
          >
            <ListAvatar
              name={conv.contact.name}
              avatarUrl={conv.contact.avatarUrl}
            />
          </div>
          {/* Checkbox: aparece no hover sempre, fica visível travada
              quando já tem seleção ativa ou esse item é parte dela.
              Fora da lista paginada (seção "Fixadas") não existe seleção
              em massa, então nem renderiza. */}
          {selectable && (
            <div
              role="checkbox"
              aria-checked={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(conv.id, index);
              }}
              className={`absolute inset-0 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
                isSelected
                  ? 'border-primary bg-primary text-white opacity-100'
                  : inSelectionMode
                    ? 'border-zinc-300 bg-zinc-100 text-transparent hover:border-primary/50 dark:border-zinc-600 dark:bg-zinc-800'
                    : 'border-zinc-300 bg-white text-transparent opacity-0 hover:border-primary/50 group-hover/avatar:opacity-100 dark:border-zinc-600 dark:bg-zinc-900'
              }`}
              title={isSelected ? 'Desmarcar' : 'Selecionar'}
            >
              <Check className="h-4 w-4" />
            </div>
          )}
          {(() => {
            const ChannelIcon = channelIcons[conv.channel.type] || MessageSquare;
            return (
              <div className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-white bg-white dark:border-zinc-950 dark:bg-zinc-900">
                <ChannelIcon className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
              </div>
            );
          })()}
        </div>
        <div className="min-w-0 flex-1">
          {(() => {
            const unread = conv.unreadCount ?? 0;
            const hasUnread = unread > 0;
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`truncate text-[13px] ${
                        hasUnread
                          ? 'font-bold text-zinc-900 dark:text-zinc-50'
                          : 'font-medium ' +
                            (isActive || isSelected
                              ? 'text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-800 dark:text-zinc-200')
                      }`}
                    >
                      {conv.contact.name || conv.contact.phone || 'Desconhecido'}
                    </span>
                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColors[conv.status] || 'bg-zinc-300'}`} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {conv.isPinnedByMe && (
                      <Pin
                        className="h-3 w-3 shrink-0 fill-zinc-400 text-zinc-400 dark:fill-zinc-500 dark:text-zinc-500"
                        aria-label="Fixada"
                      />
                    )}
                    <span
                      className={`text-[10px] tabular-nums ${
                        hasUnread
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {formatTime(conv.messages[0]?.createdAt ?? conv.lastMessageAt)}
                    </span>
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1.5">
                  <p
                    className={`truncate text-[12px] ${
                      hasUnread
                        ? 'font-semibold text-zinc-700 dark:text-zinc-200'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {getLastMessagePreview(conv)}
                  </p>
                  {hasUnread && (
                    <span className="ml-1 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
          {(conv.tags?.length || conv.contact.tags?.length) ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {conv.tags?.map((t) => (
                <span
                  key={`c-${t.tag.id}`}
                  title={`Tag na conversa: ${t.tag.name}`}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium"
                  style={{
                    backgroundColor: `${t.tag.color}1f`,
                    color: t.tag.color,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: t.tag.color }}
                  />
                  {t.tag.name}
                </span>
              ))}
              {conv.contact.tags?.map((t) => (
                <span
                  key={`ct-${t.tag.id}`}
                  title={`Tag no contato: ${t.tag.name}`}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium"
                  style={{
                    borderColor: `${t.tag.color}80`,
                    color: t.tag.color,
                  }}
                >
                  {t.tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full w-80 flex-col border-r border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Scope selector (All / Mine) */}
      <div className="px-3 pt-3">
        <Popover className="relative">
          <PopoverButton className="flex w-full items-center gap-2 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1.5 text-left text-[13px] text-zinc-700 outline-none transition-colors hover:bg-zinc-50 data-[open]:border-primary/40 data-[open]:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:data-[open]:bg-zinc-900">
            {(() => {
              const current = scopeOptions.find((o) => o.value === scope) ?? scopeOptions[0];
              const Icon = current.icon;
              return <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />;
            })()}
            <span className="flex-1 truncate font-medium">
              {scopeOptions.find((o) => o.value === scope)?.label ?? 'Todas as conversas'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom start"
            transition
            className="z-50 mt-1.5 w-[var(--button-width)] rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
          >
            {({ close }) => (
              <>
                {scopeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = scope === option.value;
                  const disabled = option.value === 'MINE' && !currentUserId;
                  return (
                    <button
                      key={option.value}
                      onClick={() => { if (!disabled) { handleScopeChange(option.value); close(); } }}
                      disabled={disabled}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isActive
                          ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                          : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">{option.label}</span>
                      {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </>
            )}
          </PopoverPanel>
        </Popover>
      </div>

      {/* Channel selector — hidden when an inbox view is active, since the
          view already pins the channel(s) via its saved filters. Letting
          the user override here would just confuse the result. */}
      {!viewId && (
      <div className="px-3 pt-2">
        <Popover className="relative">
          <PopoverButton className="flex w-full items-center gap-2 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1.5 text-left text-[13px] text-zinc-700 outline-none transition-colors hover:bg-zinc-50 data-[open]:border-primary/40 data-[open]:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:data-[open]:bg-zinc-900">
            {(() => {
              const Icon = selectedSegment
                ? Layers
                : selectedChannel
                  ? channelIcons[selectedChannel.type] || MessageSquare
                  : Inbox;
              return <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />;
            })()}
            <span className="flex-1 truncate font-medium">
              {selectedSegment
                ? selectedSegment.name
                : selectedChannel
                  ? selectedChannel.name
                  : 'Todos os canais'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom start"
            transition
            className="z-50 mt-1.5 w-[var(--button-width)] rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
          >
            {({ close }) => (
              <>
                {(() => {
                  const allActive = selectedChannelId === null && selectedSegmentId === null;
                  return (
                    <button
                      onClick={() => { handleChannelChange(null); close(); }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                        allActive
                          ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                          : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <Inbox className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1">Todos os canais</span>
                      {allActive && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })()}
                {channels.length > 0 && (
                  <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
                )}
                {channels.map((channel) => {
                  const Icon = channelIcons[channel.type] || MessageSquare;
                  const isActive = selectedChannelId === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => { handleChannelChange(channel.id); close(); }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                        isActive
                          ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                          : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">{channel.name}</span>
                      {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
                {segments.length > 0 && (
                  <>
                    <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
                    <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Segmentos
                    </p>
                    {segments.map((segment) => {
                      const isActive = selectedSegmentId === segment.id;
                      return (
                        <button
                          key={segment.id}
                          onClick={() => { handleSegmentChange(segment.id); close(); }}
                          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                            isActive
                              ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                              : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <Layers className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{segment.name}</span>
                          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </PopoverPanel>
        </Popover>
      </div>
      )}

      {/* Search + Filter */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
        <div className="group relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-primary" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-md border-0 bg-zinc-100/80 py-1.5 pl-8 pr-8 text-[13px] text-zinc-900 outline-none ring-1 ring-transparent transition-all placeholder:text-zinc-400 focus:bg-white focus:ring-primary/30 focus:shadow-sm dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-900 dark:focus:ring-primary/30"
          />
          {search && (
            <button
              onClick={() => { handleSearchChange(''); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <Popover className="relative">
          <PopoverButton
            // Filtros funcionam sempre — dentro ou fora de uma view. Quando
            // dentro de view, eles agem como override em cima dos filtros
            // salvos da view (backend faz o merge no /inbox-views/:id/conv).
            className={`relative flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors outline-none data-[open]:bg-zinc-100 data-[open]:text-zinc-600 dark:data-[open]:bg-zinc-800 dark:data-[open]:text-zinc-300 ${
              activeFilterCount > 0
                ? 'bg-primary/10 text-primary dark:bg-primary/20 data-[open]:bg-primary/10 data-[open]:text-primary dark:data-[open]:bg-primary/20 dark:data-[open]:text-primary'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </PopoverButton>

          <PopoverPanel
            anchor="bottom end"
            transition
            className="z-50 mt-1.5 w-64 rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
          >
            <div>
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Filtros
              </p>
              {filterOptions.map((f) => {
                const isActive =
                  f.value === 'unread'
                    ? unreadOnly
                    : f.value === 'archived'
                      ? archivedOnly
                      : showGroups;
                const Icon = f.icon;
                return (
                  <button
                    key={f.value}
                    onClick={() => toggleListFilter(f.value)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                      isActive
                        ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                        : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isActive
                        ? 'border-primary bg-primary text-white'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {isActive && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 leading-tight">
                      <span className="block">{f.label}</span>
                      <span className="block text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                        {f.description}
                      </span>
                    </span>
                  </button>
                );
              })}
              {/* ─── Projeto ─── */}
              <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Projeto
              </p>
              <div className="px-2.5 pb-1.5">
                <select
                  value={selectedProjectStatus}
                  onChange={(e) => handleProjectStatusChange(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <option value="">Status: todos</option>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={toggleMineProjects}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  mineProjects
                    ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                    : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    mineProjects
                      ? 'border-primary bg-primary text-white'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}
                >
                  {mineProjects && <Check className="h-2.5 w-2.5" />}
                </div>
                <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 leading-tight">Meus projetos</span>
              </button>

              {tags.length > 0 && (
                <>
                  <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Tags
                    </p>
                    {selectedTagIds.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedTagIds([]);
                          updatePrefs({ tagIds: [] });
                        }}
                        className="text-[10px] text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="px-1.5 pb-1">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Buscar tag..."
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        // Headless UI fecha o popover quando o foco vaza ou
                        // quando ESC sobe — paramos a propagação pra ESC
                        // limpar o campo sem fechar tudo.
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' && tagSearch) {
                            e.stopPropagation();
                            setTagSearch('');
                          }
                        }}
                        className="w-full rounded-md border-0 bg-zinc-100/80 py-1 pl-7 pr-7 text-[12px] text-zinc-900 outline-none ring-1 ring-transparent transition-all placeholder:text-zinc-400 focus:bg-white focus:ring-primary/30 dark:bg-zinc-800/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-900"
                      />
                      {tagSearch && (
                        <button
                          onClick={() => setTagSearch('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto scrollbar-thin">
                    {filteredTags.length === 0 ? (
                      <p className="px-2.5 py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                        Nenhuma tag encontrada
                      </p>
                    ) : (
                      filteredTags.map((tag) => {
                        const isActive = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTagFilter(tag.id)}
                            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                              isActive
                                ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                                : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                            }`}
                          >
                            <div
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                isActive
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-zinc-300 dark:border-zinc-600'
                              }`}
                            >
                              {isActive && <Check className="h-2.5 w-2.5" />}
                            </div>
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="flex-1 truncate">{tag.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
              {activeFilterCount > 0 && (
                <>
                  <div className="mx-2 my-1 border-t border-zinc-100 dark:border-zinc-800" />
                  <button
                    onClick={clearListFilters}
                    className="flex w-full items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
                  >
                    <X className="h-3 w-3" />
                    Limpar filtros
                  </button>
                </>
              )}
            </div>
          </PopoverPanel>
        </Popover>

        <button
          type="button"
          onClick={() => setNewConversationOpen(true)}
          title="Nova conversa"
          aria-label="Nova conversa"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {filterOptions.map((option) => {
            const isActive =
              option.value === 'unread' ? unreadOnly : archivedOnly;
            if (!isActive) return null;
            return (
              <span
                key={option.value}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20"
              >
                {option.label}
                {option.value === 'unread' && (
                  <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold leading-none py-[3px] dark:bg-primary/30">
                    {totalCount}
                  </span>
                )}
                <button
                  onClick={() => toggleListFilter(option.value)}
                  className="rounded-full p-0.5 transition-colors hover:bg-primary/20 dark:hover:bg-primary/30"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          {selectedTagIds.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <span
                key={tag.id}
                title={`Filtrando por tag: ${tag.name}`}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `${tag.color}1f`,
                  color: tag.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                <button
                  onClick={() => toggleTagFilter(tag.id)}
                  className="rounded-full p-0.5 transition-colors"
                  style={{ backgroundColor: `${tag.color}14` }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          {activeFilterCount > 1 && (
            <button
              onClick={clearListFilters}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <X className="h-2.5 w-2.5" />
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1.5 border-t border-b border-zinc-200/80 bg-primary/4 px-3 py-1.5 dark:border-zinc-800 dark:bg-primary/10">
          <button
            onClick={clearSelection}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300">
            {selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={selectAll}
            className="text-[11px] text-primary hover:underline"
          >
            Todas
          </button>
          <div className="flex-1" />
          <button
            onClick={handleCreateInboxFromSelection}
            disabled={bulkLoading}
            title="Criar inbox com selecionadas"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50 dark:hover:bg-amber-500/10"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <BulkAiPopover
            count={selectedIds.size}
            disabled={bulkLoading}
            onSetOverride={handleBulkSetAi}
            onEngage={handleBulkEngageAi}
          />
          <BulkPipelinePopover
            count={selectedIds.size}
            disabled={bulkLoading}
            onConfirm={handleBulkAddToPipeline}
          />
          <button
            onClick={() => handleBulkAction('assign')}
            disabled={bulkLoading}
            title="Assumir"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <UserCheck className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleBulkAction('close')}
            disabled={bulkLoading}
            title="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleBulkAction('reopen')}
            disabled={bulkLoading}
            title="Reabrir"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-500 disabled:opacity-50 dark:hover:bg-emerald-500/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Divider */}
      {selectedIds.size === 0 && (
        <div className="mx-3 border-t border-zinc-100 dark:border-zinc-800/60" />
      )}

      {/* Fixadas — per-user, sempre visível por padrão (elevada ao topo),
          scroll próprio pra não empurrar a lista principal quando há muitas. */}
      {pinnedEnabled && pinnedConversations.length > 0 && (
        <div className="max-h-[280px] shrink-0 overflow-y-auto scrollbar-thin border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Fixadas
          </div>
          {pinnedConversations.map((conv, index) =>
            renderConversationRow(conv, index, false),
          )}
        </div>
      )}

      {/* Conversation list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-3 py-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-3 w-36 animate-pulse rounded bg-zinc-50 dark:bg-zinc-800/60" />
              </div>
            </div>
          ))
        ) : isError ? (
          <div role="alert" className="col-span-full p-6 text-center text-sm text-zinc-500">
            <p>Não foi possível carregar conversas.</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 text-primary hover:underline">
              Tentar novamente
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <MessageSquare className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-zinc-400 dark:text-zinc-500">
              Nenhuma conversa encontrada
            </p>
            {(activeFilterCount > 0 || search) && (
              <button
                onClick={() => { clearListFilters(); handleSearchChange(''); }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {conversations.map((conv, index) =>
              renderConversationRow(conv, index, true),
            )}
            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-1" />
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <ConversationContextMenu
          conversation={contextMenu.conversation}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}

      <NewConversationDialog
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onCreated={onSelect}
      />
    </div>
  );
}
