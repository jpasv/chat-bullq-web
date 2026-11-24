'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, FolderKanban } from 'lucide-react';
import { useOrgId } from '@/hooks/use-org-query-key';
import { membersService } from '@/features/settings/services/members.service';
import { projectsService } from '../services/projects.service';
import { PROJECT_STATUSES, hoppeTaskUrl } from '../project-fields';
import { normalizeSearchText, textIncludes } from '@/lib/search';

const controlCls =
  'h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export function ProjectsTable() {
  const orgId = useOrgId();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => membersService.list(),
    staleTime: 60_000,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['projects', orgId, { status, responsibleUserId }],
    queryFn: () =>
      projectsService.list({
        status: status || undefined,
        responsibleUserId: responsibleUserId || undefined,
      }),
  });

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    if (!q) return rows;
    return rows.filter((r) => textIncludes(r.name, q) || textIncludes(r.hoppeId, q));
  }, [rows, search]);

  const openProject = (conversationId: string) => {
    router.push(`/inbox?conversationId=${conversationId}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="flex items-center gap-2">
        <FolderKanban className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Projetos
        </h1>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Cada grupo de WhatsApp é um projeto. Clique para abrir no atendimento.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className={`${controlCls} w-64 pl-8`}
            placeholder="Buscar por nome ou Hoppe ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={controlCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={controlCls}
          value={responsibleUserId}
          onChange={(e) => setResponsibleUserId(e.target.value)}
        >
          <option value="">Todos os responsáveis</option>
          {members
            .filter((m) => m.user.isActive)
            .map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
        </select>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Projeto</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Responsável</th>
              <th className="px-4 py-2.5 font-medium">Hoppe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </td>
                </tr>
              ))
            ) : filtered.length > 0 ? (
              filtered.map((r) => (
                <tr
                  key={r.groupJid}
                  onClick={() => openProject(r.representativeConversationId)}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {r.name}
                  </td>
                  <td className="px-4 py-3">
                    {r.status ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {r.status}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {r.responsible?.name ?? (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.hoppeId ? (
                      <a
                        href={hoppeTaskUrl(r.hoppeId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {r.hoppeId}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-zinc-400"
                >
                  Nenhum projeto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
