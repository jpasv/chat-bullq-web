'use client';

import type { Channel } from '@/features/channels/services/channels.service';

export type CommentsView = 'all' | 'unreplied' | 'hidden' | 'deleted';

export interface CommentsFilterState {
  channelId: string;
  view: CommentsView;
}

const controlCls =
  'h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

interface Props {
  channels: Channel[];
  value: CommentsFilterState;
  onChange: (next: CommentsFilterState) => void;
}

export function CommentsFilters({ channels, value, onChange }: Props) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <select
        className={controlCls}
        value={value.channelId}
        onChange={(e) => onChange({ ...value, channelId: e.target.value })}
      >
        <option value="">Todas as contas</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        className={controlCls}
        value={value.view}
        onChange={(e) => onChange({ ...value, view: e.target.value as CommentsView })}
      >
        <option value="all">Todos</option>
        <option value="unreplied">Sem resposta</option>
        <option value="hidden">Ocultos</option>
        <option value="deleted">Deletados</option>
      </select>
    </div>
  );
}
