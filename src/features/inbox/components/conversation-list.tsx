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
  Users,
  User,
  FolderPlus,
  MailOpen,
  Archive,
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
import { tagsService } from '@/features/settings/services/tags.service';
import { membersService } from '@/features/settings/services/members.service';
import {
  InboxFilterPanel,
  ASSIGNED_TO_ME,
  type DateRangePreset,
} from './inbox-filter-panel';
import { ZappfyIcon, MetaIcon, InstagramIcon } from '@/components/ui/icons';
import { useOrgId } from '@/hooks/use-org-query-key';
import { useSocket } from '../hooks/use-socket';
import { useAuthStore } from '@/stores/auth-store';
import { useInboxPreferences } from '../hooks/use-inbox-preferences';
import { ConversationContextMenu } from './conversation-context-menu';
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
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-400',
  OPEN: 'bg-emerald-400',
  BOT: 'bg-blue-400',
  WAITING: 'bg-violet-400',
  CLOSED: 'bg-zinc-300 dark:bg-zinc-600',
};

const STATUS_CHIP_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  OPEN: 'Aberto',
  WAITING: 'Aguardando',
  CLOSED: 'Fechado',
};

const DATE_CHIP_LABELS: Record<string, string> = {
  TODAY: 'Hoje',
  '7D': '7 dias',
  '30D': '30 dias',
  RANGE: 'Intervalo',
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
  // Role vem da org ativa (OWNER/ADMIN/AGENT). Pra AGENT, o filtro de
  // Atendente é um no-op visual (RN-05 é server-side) — desabilitamos a linha.
  const currentRole = useAuthStore(
    (s) => s.organizations.find((o) => o.id === s.activeOrgId)?.role ?? null,
  );
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
  // Novas dimensões do painel unificado.
  const [selectedStatus, setSelectedStatus] = useState('');
  // null = sem filtro; ASSIGNED_TO_ME = resolve pro currentUserId; senão userId.
  const [selectedAssignedToId, setSelectedAssignedToId] = useState<string | null>(
    null,
  );
  const [dateRange, setDateRange] = useState<DateRangePreset>('ALL');
  // Datas do preset RANGE — strings YYYY-MM-DD dos <input type="date">.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // showGroups conta como filtro ativo SÓ quando ON (default OFF é o
  // comportamento padrão, não merece badge). Tags contam 1 por tag.
  const activeFilterCount =
    (unreadOnly ? 1 : 0) +
    (archivedOnly ? 1 : 0) +
    (showGroups ? 1 : 0) +
    (selectedProjectStatus ? 1 : 0) +
    (mineProjects ? 1 : 0) +
    (selectedStatus ? 1 : 0) +
    (selectedAssignedToId ? 1 : 0) +
    (dateRange !== 'ALL' ? 1 : 0) +
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
    if (typeof savedPrefs.selectedStatus === 'string') {
      setSelectedStatus(savedPrefs.selectedStatus);
    }
    if (savedPrefs.selectedAssignedToId !== undefined) {
      setSelectedAssignedToId(savedPrefs.selectedAssignedToId ?? null);
    }
    if (typeof savedPrefs.dateRange === 'string') {
      setDateRange(savedPrefs.dateRange as DateRangePreset);
    }
    if (savedPrefs.dateFrom !== undefined && savedPrefs.dateFrom !== null) {
      setDateFrom(savedPrefs.dateFrom);
    }
    if (savedPrefs.dateTo !== undefined && savedPrefs.dateTo !== null) {
      setDateTo(savedPrefs.dateTo);
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
    setSelectedStatus('');
    setSelectedAssignedToId(null);
    setDateRange('ALL');
    setDateFrom('');
    setDateTo('');
    updatePrefs({
      unreadOnly: false,
      archivedOnly: false,
      showGroups: false,
      tagIds: [],
      selectedProjectStatus: '',
      mineProjects: false,
      selectedStatus: '',
      selectedAssignedToId: null,
      dateRange: 'ALL',
      dateFrom: null,
      dateTo: null,
    });
  }, [updatePrefs]);

  const handleStatusChange = useCallback(
    (value: string) => {
      setSelectedStatus(value);
      updatePrefs({ selectedStatus: value });
    },
    [updatePrefs],
  );

  const handleAssignedToChange = useCallback(
    (value: string | null) => {
      const next = value || null;
      setSelectedAssignedToId(next);
      updatePrefs({ selectedAssignedToId: next });
    },
    [updatePrefs],
  );

  const handleDateRangeChange = useCallback(
    (preset: DateRangePreset) => {
      setDateRange(preset);
      updatePrefs({ dateRange: preset });
    },
    [updatePrefs],
  );

  const handleDateFromChange = useCallback(
    (value: string) => {
      setDateFrom(value);
      updatePrefs({ dateFrom: value || null });
    },
    [updatePrefs],
  );

  const handleDateToChange = useCallback(
    (value: string) => {
      setDateTo(value);
      updatePrefs({ dateTo: value || null });
    },
    [updatePrefs],
  );

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
  const filterKey = `${unreadOnly ? 'u' : ''}|${archivedOnly ? 'a' : ''}|${showGroups ? 'g' : ''}|ps:${selectedProjectStatus}|mp:${mineProjects ? '1' : ''}|t:${tagsKey}|st:${selectedStatus}|at:${selectedAssignedToId ?? ''}|dr:${dateRange}|df:${dateFrom}|dt:${dateTo}`;

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

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => membersService.list(),
    staleTime: 60_000,
  });

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

  // Resolve o preset de Data em ISO { from, to }. Roda client-side, então
  // Date.now()/new Date() são seguros aqui. Backend filtra por lastMessageAt
  // (gte from / lte to). filterKey já inclui dateRange/from/to, então o
  // recompute do memo casa com a chave de cache.
  const resolvedDate = useMemo((): { from?: string; to?: string } => {
    const now = new Date();
    if (dateRange === 'TODAY') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString() };
    }
    if (dateRange === '7D') {
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    if (dateRange === '30D') {
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    if (dateRange === 'RANGE') {
      const out: { from?: string; to?: string } = {};
      if (dateFrom) {
        const d = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(d.getTime())) out.from = d.toISOString();
      }
      if (dateTo) {
        const d = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(d.getTime())) out.to = d.toISOString();
      }
      return out;
    }
    return {};
  }, [dateRange, dateFrom, dateTo]);

  // Reset scroll when filters/search change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [filterKey, debouncedSearch, selectedChannelId, selectedSegmentId, scope, showGroups, tagsKey]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['conversations', orgId, viewId ?? null, filterKey, debouncedSearch, selectedChannelId, selectedSegmentId, scope, currentUserId, selectedStatus, selectedAssignedToId, dateRange, dateFrom, dateTo],
    queryFn: ({ pageParam = 1 }) => {
      const params: Record<string, string> = { limit: '30', page: String(pageParam) };
      if (unreadOnly) params.unread = 'true';
      // archived: dentro de view, só passa quando user explicitamente
      // ativou (override). Fora de view, passa sempre o estado atual.
      if (viewId) {
        if (archivedOnly) params.archived = 'only';
      } else {
        params.archived = archivedOnly ? 'only' : 'exclude';
      }
      // Filtros que unificam por grupo (segmento OU projeto) — são sempre
      // grupos: força groups=only e ignora o filtro de canal. Segmento tem
      // precedência se ambos estiverem ativos.
      const hasProjectFilter =
        !!selectedProjectStatus || (mineProjects && !!currentUserId);
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
      // Status da conversa (PENDING/OPEN/WAITING/CLOSED). Backend ignora
      // valores inválidos, então '' = todos.
      if (selectedStatus) params.status = selectedStatus;
      // Atendente tem precedência sobre o scope MINE. UM único writer de
      // assignedToId: se o filtro de Atendente está setado, ele manda;
      // senão cai no comportamento antigo do scope. ASSIGNED_TO_ME resolve
      // pro usuário atual.
      const resolvedAssignee =
        selectedAssignedToId === ASSIGNED_TO_ME
          ? currentUserId
          : selectedAssignedToId;
      if (resolvedAssignee) {
        params.assignedToId = resolvedAssignee;
      } else if (scope === 'MINE' && currentUserId) {
        params.assignedToId = currentUserId;
      }
      // Data — presets/intervalo já resolvidos em ISO.
      if (resolvedDate.from) params.dateFrom = resolvedDate.from;
      if (resolvedDate.to) params.dateTo = resolvedDate.to;
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

  // Total count from the paginated response — same value across pages
  // (it's the count(where) from Postgres). Used to show "Não lidas (N)"
  // in the active filter chip.
  const totalCount = data?.pages?.[0]?.pagination?.total ?? 0;

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
    // Reconnect: any events that fired while we were offline are gone, so
    // sync the list from scratch when the socket comes back.
    const unsubReconnect = onReconnect(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-views'] });
    });
    return () => {
      unsubNew?.();
      unsubImported?.();
      unsubUpdated?.();
      unsubRead?.();
      unsubUnread?.();
      unsubReconnect?.();
    };
  }, [on, onReconnect, queryClient]);

  const handleBulkAction = useCallback(
    async (action: 'close' | 'assign' | 'reopen') => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkLoading(true);
      try {
        if (action === 'close') await inboxService.bulkClose(ids);
        else if (action === 'assign') await inboxService.bulkAssignToMe(ids);
        else if (action === 'reopen') await inboxService.bulkReopen(ids);
        clearSelection();
        invalidateConversations();
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, clearSelection, invalidateConversations],
  );

  const handleBulkSetAi = useCallback(
    async (override: boolean | null) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setBulkLoading(true);
      try {
        await inboxService.bulkSetAi(ids, override);
        const label =
          override === null
            ? 'IA voltou ao padrão'
            : override
              ? 'IA forçada'
              : 'IA pausada';
        toast.success(`${label} em ${ids.length} conversa${ids.length > 1 ? 's' : ''}`);
        clearSelection();
        invalidateConversations();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Erro ao alterar IA em massa');
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, clearSelection, invalidateConversations],
  );

  const handleBulkEngageAi = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      await inboxService.bulkEngageAi(ids);
      toast.success(
        `IA engajada em ${ids.length} conversa${ids.length > 1 ? 's' : ''}`,
      );
      clearSelection();
      invalidateConversations();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao engajar IA');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, invalidateConversations]);

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
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - ok;
        if (failed === 0) {
          toast.success(
            `${ok} conversa${ok > 1 ? 's' : ''} adicionada${ok > 1 ? 's' : ''} ao pipeline`,
          );
        } else if (ok === 0) {
          toast.error(`Falha ao adicionar (${failed} ${failed > 1 ? 'erros' : 'erro'})`);
        } else {
          toast.warning(`${ok} adicionadas, ${failed} falharam`);
        }
        clearSelection();
        invalidateConversations();
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, clearSelection, invalidateConversations],
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
            className="z-50 mt-1.5 w-72 rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
          >
            <InboxFilterPanel
              hideChannelSegment={!!viewId}
              disableAtendente={currentRole === 'AGENT'}
              segments={segments}
              tags={tags}
              channels={channels}
              members={members}
              selectedSegmentId={selectedSegmentId}
              onSegmentChange={handleSegmentChange}
              selectedChannelId={selectedChannelId}
              onChannelChange={handleChannelChange}
              selectedTagIds={selectedTagIds}
              onToggleTag={toggleTagFilter}
              onClearTags={() => {
                setSelectedTagIds([]);
                updatePrefs({ tagIds: [] });
              }}
              selectedAssignedToId={selectedAssignedToId}
              onAssignedToChange={handleAssignedToChange}
              dateRange={dateRange}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateRangeChange={handleDateRangeChange}
              onDateFromChange={handleDateFromChange}
              onDateToChange={handleDateToChange}
              selectedStatus={selectedStatus}
              onStatusChange={handleStatusChange}
              selectedProjectStatus={selectedProjectStatus}
              onProjectStatusChange={handleProjectStatusChange}
              mineProjects={mineProjects}
              onToggleMineProjects={toggleMineProjects}
              showGroups={showGroups}
              onToggleGroups={() => toggleListFilter('groups')}
              unreadOnly={unreadOnly}
              onToggleUnread={() => toggleListFilter('unread')}
              archivedOnly={archivedOnly}
              onToggleArchived={() => toggleListFilter('archived')}
              onClearAll={clearListFilters}
            />
          </PopoverPanel>
        </Popover>
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
          {selectedStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20">
              {STATUS_CHIP_LABELS[selectedStatus] ?? selectedStatus}
              <button
                onClick={() => handleStatusChange('')}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20 dark:hover:bg-primary/30"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {selectedAssignedToId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20">
              {selectedAssignedToId === ASSIGNED_TO_ME
                ? 'Atribuídas a mim'
                : members.find((m) => m.user.id === selectedAssignedToId)?.user
                    .name ?? 'Atendente'}
              <button
                onClick={() => handleAssignedToChange(null)}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20 dark:hover:bg-primary/30"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
          {dateRange !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary dark:bg-primary/20">
              {DATE_CHIP_LABELS[dateRange] ?? 'Data'}
              <button
                onClick={() => handleDateRangeChange('ALL')}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20 dark:hover:bg-primary/30"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
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
            {conversations.map((conv, index) => {
              const isActive = conv.id === activeId;
              const isSelected = selectedIds.has(conv.id);
              const inSelectionMode = selectedIds.size > 0;
              return (
                <button
                  key={conv.id}
                  onClick={(e) => handleConversationClick(conv, index, e)}
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
                        quando já tem seleção ativa ou esse item é parte dela. */}
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
            })}
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
    </div>
  );
}
