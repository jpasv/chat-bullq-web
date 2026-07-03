'use client';

import { useMemo, useState } from 'react';
import {
  Search,
  X,
  Check,
  MailOpen,
  Archive,
  Users,
  User,
  FolderKanban,
} from 'lucide-react';
import type { Segment } from '@/features/segments/services/segments.service';
import type { Tag } from '@/features/settings/services/tags.service';
import type { Channel } from '@/features/channels/services/channels.service';
import type { Member } from '@/features/settings/services/members.service';
import { PROJECT_STATUSES } from '@/features/projects/project-fields';

/** Sentinel value for the "Atribuídas a mim" option in the Atendente select. */
export const ASSIGNED_TO_ME = '__ME__';

/** Presets do filtro de Data. */
export type DateRangePreset = 'ALL' | 'TODAY' | '7D' | '30D' | 'RANGE';

const CONVERSATION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Status: todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'OPEN', label: 'Aberto' },
  { value: 'WAITING', label: 'Aguardando' },
  { value: 'CLOSED', label: 'Fechado' },
];

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'TODAY', label: 'Hoje' },
  { value: '7D', label: '7 dias' },
  { value: '30D', label: '30 dias' },
  { value: 'RANGE', label: 'Intervalo' },
];

const labelCls =
  'px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500';
const selectCls =
  'w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

interface InboxFilterPanelProps {
  /** When true, hide Setor/Canal selectors (a saved view already pins them). */
  hideChannelSegment?: boolean;
  /** When true, disable the Atendente row (AGENT role — server enforces RN-05). */
  disableAtendente?: boolean;

  // Data sources
  segments: Segment[];
  tags: Tag[];
  channels: Channel[];
  members: Member[];

  // Setor (Segmento) — mutually exclusive with Canal
  selectedSegmentId: string | null;
  onSegmentChange: (id: string | null) => void;

  // Canal
  selectedChannelId: string | null;
  onChannelChange: (id: string | null) => void;

  // Etiqueta (tags)
  selectedTagIds: string[];
  onToggleTag: (id: string) => void;
  onClearTags: () => void;

  // Atendente — value is a userId, ASSIGNED_TO_ME, or '' (todos)
  selectedAssignedToId: string | null;
  onAssignedToChange: (value: string | null) => void;

  // Data
  dateRange: DateRangePreset;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (preset: DateRangePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;

  // Status (conversation)
  selectedStatus: string;
  onStatusChange: (value: string) => void;

  // Projeto (mantido do filtro antigo)
  selectedProjectStatus: string;
  onProjectStatusChange: (value: string) => void;
  mineProjects: boolean;
  onToggleMineProjects: () => void;

  // Toggles
  showGroups: boolean;
  onToggleGroups: () => void;
  unreadOnly: boolean;
  onToggleUnread: () => void;
  archivedOnly: boolean;
  onToggleArchived: () => void;

  onClearAll: () => void;
}

function ToggleRow({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  description?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
          : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
      }`}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          active
            ? 'border-primary bg-primary text-white'
            : 'border-zinc-300 dark:border-zinc-600'
        }`}
      >
        {active && <Check className="h-2.5 w-2.5" />}
      </div>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 leading-tight">
        <span className="block">{label}</span>
        {description && (
          <span className="block text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

export function InboxFilterPanel(props: InboxFilterPanelProps) {
  const {
    hideChannelSegment,
    disableAtendente,
    segments,
    tags,
    channels,
    members,
    selectedSegmentId,
    onSegmentChange,
    selectedChannelId,
    onChannelChange,
    selectedTagIds,
    onToggleTag,
    onClearTags,
    selectedAssignedToId,
    onAssignedToChange,
    dateRange,
    dateFrom,
    dateTo,
    onDateRangeChange,
    onDateFromChange,
    onDateToChange,
    selectedStatus,
    onStatusChange,
    selectedProjectStatus,
    onProjectStatusChange,
    mineProjects,
    onToggleMineProjects,
    showGroups,
    onToggleGroups,
    unreadOnly,
    onToggleUnread,
    archivedOnly,
    onToggleArchived,
    onClearAll,
  } = props;

  const [tagSearch, setTagSearch] = useState('');

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, tagSearch]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.user.isActive),
    [members],
  );

  const section = 'px-1.5 py-1';

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
      {/* ─── Setor (Segmento) ─── */}
      {!hideChannelSegment && (
        <div className={section}>
          <p className={labelCls}>Setor</p>
          <select
            value={selectedSegmentId ?? ''}
            onChange={(e) => onSegmentChange(e.target.value || null)}
            className={selectCls}
          >
            <option value="">Todos os setores</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ─── Canal ─── */}
      {!hideChannelSegment && (
        <div className={section}>
          <p className={labelCls}>Canal</p>
          <select
            value={selectedChannelId ?? ''}
            onChange={(e) => onChannelChange(e.target.value || null)}
            className={selectCls}
          >
            <option value="">Todos os canais</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ─── Atendente ─── */}
      <div className={section}>
        <p className={labelCls}>Atendente</p>
        <select
          value={selectedAssignedToId ?? ''}
          onChange={(e) => onAssignedToChange(e.target.value || null)}
          disabled={disableAtendente}
          className={`${selectCls} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Todos</option>
          <option value={ASSIGNED_TO_ME}>Atribuídas a mim</option>
          {activeMembers.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Status ─── */}
      <div className={section}>
        <p className={labelCls}>Status</p>
        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className={selectCls}
        >
          {CONVERSATION_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Data ─── */}
      <div className={section}>
        <p className={labelCls}>Data</p>
        <div className="flex flex-wrap gap-1">
          {DATE_RANGE_OPTIONS.map((o) => {
            const active = dateRange === o.value;
            return (
              <button
                key={o.value}
                onClick={() => onDateRangeChange(o.value)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary dark:bg-primary/20'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {dateRange === 'RANGE' && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className={`${selectCls} flex-1`}
            />
            <span className="text-[11px] text-zinc-400">até</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className={`${selectCls} flex-1`}
            />
          </div>
        )}
      </div>

      {/* ─── Projeto ─── */}
      <div className={`${section} border-t border-zinc-100 dark:border-zinc-800`}>
        <p className={labelCls}>Projeto</p>
        <select
          value={selectedProjectStatus}
          onChange={(e) => onProjectStatusChange(e.target.value)}
          className={selectCls}
        >
          <option value="">Status: todos</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="mt-1">
          <ToggleRow
            active={mineProjects}
            onClick={onToggleMineProjects}
            icon={FolderKanban}
            label="Meus projetos"
          />
        </div>
      </div>

      {/* ─── Etiqueta (Tags) ─── */}
      {tags.length > 0 && (
        <div className={`${section} border-t border-zinc-100 dark:border-zinc-800`}>
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Etiqueta
            </p>
            {selectedTagIds.length > 0 && (
              <button
                onClick={onClearTags}
                className="text-[10px] text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="pb-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar tag..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
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
          <div className="max-h-40 overflow-y-auto scrollbar-thin">
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
                    onClick={() => onToggleTag(tag.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
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
        </div>
      )}

      {/* ─── Toggles ─── */}
      <div className={`${section} border-t border-zinc-100 dark:border-zinc-800`}>
        <ToggleRow
          active={!showGroups}
          onClick={showGroups ? onToggleGroups : () => {}}
          icon={User}
          label="Individual"
          description="Conversas individuais"
        />
        <ToggleRow
          active={showGroups}
          onClick={!showGroups ? onToggleGroups : () => {}}
          icon={Users}
          label="Grupo"
          description="Inclui conversas de grupos"
        />
        <ToggleRow
          active={unreadOnly}
          onClick={onToggleUnread}
          icon={MailOpen}
          label="Não lidas"
          description="Apenas com mensagens novas"
        />
        <ToggleRow
          active={archivedOnly}
          onClick={onToggleArchived}
          icon={Archive}
          label="Arquivadas"
          description="Mostra a inbox arquivada"
        />
      </div>

      {/* ─── Footer: Limpar tudo ─── */}
      <div className="border-t border-zinc-100 px-1.5 py-1.5 dark:border-zinc-800">
        <button
          onClick={onClearAll}
          className="flex w-full items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
        >
          <X className="h-3 w-3" />
          Limpar tudo
        </button>
      </div>
    </div>
  );
}
