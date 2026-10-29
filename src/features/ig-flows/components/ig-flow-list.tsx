'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Workflow } from 'lucide-react';
import { channelsService } from '@/features/channels/services/channels.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { igFlowsService, type IgFlowRunStatus } from '../services/ig-flows.service';
import { RUN_STATUS_CLASS, RUN_STATUS_LABEL, TRIGGER_LABEL, formatDateTime } from '../utils/ig-flow-format';

const LIST_STATUSES: IgFlowRunStatus[] = ['DONE', 'WAITING', 'WAITING_INTERACTION', 'FAILED'];

export function IgFlowList() {
  const orgId = useOrgId();
  const { data: flows, isLoading } = useQuery({
    queryKey: ['ig-flows', orgId],
    queryFn: () => igFlowsService.list(),
    enabled: !!orgId,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
    staleTime: 60_000,
  });
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Fluxos do Instagram</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações de comentário e story → DM. Somente leitura por enquanto.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
          ))
        ) : flows && flows.length > 0 ? (
          flows.map((flow) => {
            const keywords = flow.triggerConfig.keywords ?? [];
            return (
              <Link
                key={flow.id}
                href={`/ig-flows/${flow.id}`}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${flow.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                      <Workflow className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{flow.name}</h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {TRIGGER_LABEL[flow.triggerType] ?? flow.triggerType} · {flow.nodes.length} nós
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${flow.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>
                    {flow.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {keywords.length > 0 ? (
                    keywords.map((k) => (
                      <span key={k} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {k}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-zinc-400">Qualquer texto</span>
                  )}
                  {(flow.channelIds.length > 0 ? flow.channelIds.map(channelName) : ['Todas as contas']).map((name) => (
                    <span key={name} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                      {name}
                    </span>
                  ))}
                </div>

                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {flow.stats?.total ?? 0} execuções
                    </span>
                    {LIST_STATUSES.map((s) =>
                      flow.stats?.byStatus[s] ? (
                        <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RUN_STATUS_CLASS[s]}`}>
                          {flow.stats.byStatus[s]} {RUN_STATUS_LABEL[s].toLowerCase()}
                        </span>
                      ) : null,
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-400">Última: {formatDateTime(flow.stats?.lastRunAt)}</p>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="col-span-full rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <Workflow className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-2 text-sm text-zinc-500">Nenhum fluxo do Instagram cadastrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
