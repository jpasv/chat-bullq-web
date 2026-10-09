'use client';

import { Search } from 'lucide-react';

export type CommentsView = 'all' | 'unreplied' | 'hidden' | 'deleted';
export type CommentsSort = 'newest' | 'oldest' | 'unreplied_first';

export interface CommentsToolbarState {
  view: CommentsView;
  sort: CommentsSort;
  search: string;
}

const controlCls =
  'h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

interface Props {
  value: CommentsToolbarState;
  onChange: (next: CommentsToolbarState) => void;
}

/** Barra da coluna de comentários: busca, filtro de estado e ordenação. */
export function CommentsToolbar({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          aria-label="Buscar por autor ou texto"
          className={`${controlCls} w-full pl-8`}
          placeholder="Buscar por @autor ou texto…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </div>
      <select
        aria-label="Filtro"
        className={controlCls}
        value={value.view}
        onChange={(e) => onChange({ ...value, view: e.target.value as CommentsView })}
      >
        <option value="unreplied">Sem resposta</option>
        <option value="all">Todos</option>
        <option value="hidden">Ocultos</option>
        <option value="deleted">Deletados</option>
      </select>
      <select
        aria-label="Ordenação"
        className={controlCls}
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as CommentsSort })}
      >
        <option value="newest">Mais recentes</option>
        <option value="oldest">Mais antigos</option>
        <option value="unreplied_first">Sem resposta primeiro</option>
      </select>
    </div>
  );
}
