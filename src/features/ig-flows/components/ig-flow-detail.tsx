'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, GitBranch, Globe, MessageCircle, MousePointerClick, Zap } from 'lucide-react';
import { channelsService } from '@/features/channels/services/channels.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import {
  igFlowsService,
  type IgFlow,
  type IgFlowNode,
  type IgFlowRun,
  type IgFlowRunStatus,
  type IgFlowStats,
} from '../services/ig-flows.service';
import {
  NODE_TYPE_LABEL,
  RUN_STATUS_CLASS,
  RUN_STATUS_LABEL,
  TRIGGER_LABEL,
  describeDelay,
  formatDateTime,
  orderNodes,
  parkedLabel,
} from '../utils/ig-flow-format';

const NODE_ICON = {
  message: MessageCircle,
  condition: GitBranch,
  http: Globe,
  delay: Clock,
} as const;

const RUN_STATUSES: IgFlowRunStatus[] = ['RUNNING', 'WAITING', 'WAITING_INTERACTION', 'DONE', 'FAILED'];

/** Contagem de um evento do log num nó (ou botão). */
function countEvent(stats: IgFlowStats | undefined, nodeId: string, events: string[]): number {
  return (stats?.events ?? [])
    .filter((e) => e.nodeId === nodeId && events.includes(e.event))
    .reduce((sum, e) => sum + e.count, 0);
}

function lastError(run: IgFlowRun): string | null {
  for (let i = run.log.length - 1; i >= 0; i--) {
    if (run.log[i].error) return run.log[i].error!;
  }
  return null;
}

export function IgFlowDetail({ id }: { id: string }) {
  const orgId = useOrgId();
  const { data: flow, isLoading } = useQuery({
    queryKey: ['ig-flows', orgId, id],
    queryFn: () => igFlowsService.get(id),
    enabled: !!orgId,
  });
  const { data: stats } = useQuery({
    queryKey: ['ig-flows', orgId, id, 'stats'],
    queryFn: () => igFlowsService.stats(id),
    enabled: !!orgId,
    refetchInterval: 30_000,
  });
  const { data: runs = [] } = useQuery({
    queryKey: ['ig-flows', orgId, id, 'runs'],
    queryFn: () => igFlowsService.runs(id, 200),
    enabled: !!orgId,
    refetchInterval: 30_000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
    staleTime: 60_000,
  });
  const channelName = (channelId: string) => channels.find((c) => c.id === channelId)?.name ?? channelId;

  if (isLoading || !flow) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-zinc-50 dark:bg-zinc-900" />
      </div>
    );
  }

  const waiting = (stats?.byStatus.WAITING ?? 0) + (stats?.byStatus.WAITING_INTERACTION ?? 0) + (stats?.byStatus.RUNNING ?? 0);

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Link href="/ig-flows" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Fluxos do Instagram
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{flow.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${flow.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>
          {flow.isActive ? 'Ativo' : 'Inativo'}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {(flow.channelIds.length > 0 ? flow.channelIds.map(channelName) : ['Todas as contas']).join(', ')} · atualizado em {formatDateTime(flow.updatedAt)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Execuções" value={stats?.total ?? 0} />
        <StatCard label="Concluídas" value={stats?.byStatus.DONE ?? 0} />
        <StatCard label="Em andamento" value={waiting} />
        <StatCard label="Falharam" value={stats?.byStatus.FAILED ?? 0} tone={stats?.byStatus.FAILED ? 'danger' : undefined} />
        <StatCard label="Última execução" value={formatDateTime(stats?.lastRunAt)} small />
      </div>

      <TriggerCard flow={flow} stats={stats} />

      <h2 className="mt-8 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Passos</h2>
      <div className="mt-3 space-y-3">
        {orderNodes(flow).map(({ node, reachable }, index) => (
          <NodeCard key={node.id} node={node} index={index + 1} reachable={reachable} isStart={node.id === flow.startNodeId} stats={stats} />
        ))}
      </div>

      <RunsTable runs={runs} nodes={flow.nodes} channelName={channelName} />
    </div>
  );
}

function StatCard({ label, value, tone, small }: { label: string; value: number | string; tone?: 'danger'; small?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${small ? 'text-sm' : 'text-2xl'} ${tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
        {value}
      </p>
    </div>
  );
}

function TriggerCard({ flow, stats }: { flow: IgFlow; stats?: IgFlowStats }) {
  const cfg = flow.triggerConfig;
  const publicReplies = countEvent(stats, 'trigger', ['public_reply']);
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Gatilho: {TRIGGER_LABEL[flow.triggerType] ?? flow.triggerType}</h2>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-400">Palavras-chave ({cfg.match === 'exact' ? 'texto exato' : 'contém'})</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {cfg.keywords?.length ? (
              cfg.keywords.map((k) => (
                <span key={k} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">{k}</span>
              ))
            ) : (
              <span className="text-zinc-500">Qualquer texto</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Posts</dt>
          <dd className="mt-1 text-zinc-700 dark:text-zinc-300">
            {cfg.mediaIds?.length ? `${cfg.mediaIds.length} post(s) específico(s)` : 'Qualquer post'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Mesma pessoa</dt>
          <dd className="mt-1 text-zinc-700 dark:text-zinc-300">
            {cfg.oncePerContact === false ? 'Pode entrar várias vezes' : 'Entra uma vez só'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Prioridade</dt>
          <dd className="mt-1 text-zinc-700 dark:text-zinc-300">{flow.priority}</dd>
        </div>
      </dl>
      {cfg.publicReplies?.length ? (
        <div className="mt-4">
          <p className="text-xs text-zinc-400">
            Respostas públicas no comentário (sorteia uma) · {publicReplies} enviadas
          </p>
          <ul className="mt-1 space-y-1">
            {cfg.publicReplies.map((r, i) => (
              <li key={i} className="rounded-md bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NodeCard({
  node,
  index,
  reachable,
  isStart,
  stats,
}: {
  node: IgFlowNode;
  index: number;
  reachable: boolean;
  isStart: boolean;
  stats?: IgFlowStats;
}) {
  const Icon = NODE_ICON[node.type];
  const sent = countEvent(stats, node.id, ['sent', 'http']);
  const failed = countEvent(stats, node.id, ['send_failed', 'http_failed']);
  const skipped = countEvent(stats, node.id, ['skipped_outside_24h']);
  // Falhas já aparecem no contador de falhas do nó.
  const parked = (stats?.current ?? []).filter((c) => c.nodeId === node.id && c.status !== 'FAILED');

  return (
    <div className={`rounded-xl border bg-white p-5 dark:bg-zinc-900 ${reachable ? 'border-zinc-200 dark:border-zinc-800' : 'border-dashed border-zinc-300 opacity-70 dark:border-zinc-700'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{index}</span>
        <Icon className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{NODE_TYPE_LABEL[node.type]}</span>
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">{node.id}</code>
        {isStart && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">início</span>}
        {!reachable && <span className="text-[11px] text-zinc-400">não conectado ao fluxo</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {(node.type === 'message' || node.type === 'http') && (
            <span className="text-[11px] text-zinc-500">{sent} {node.type === 'http' ? 'chamadas' : 'enviadas'}</span>
          )}
          {skipped > 0 && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{skipped} puladas (fora das 24h)</span>}
          {failed > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">{failed} falhas</span>}
          {parked.map((p) => (
            <span key={p.status} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RUN_STATUS_CLASS[p.status]}`}>
              {p.count} {parkedLabel(p.status, node.type)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 pl-8">
        {node.type === 'message' && (
          <>
            <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200">{node.text}</p>
            {node.buttons?.length ? (
              <ul className="mt-2 space-y-1.5">
                {node.buttons.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md border border-zinc-300 px-2 py-1 font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">{b.title}</span>
                    {b.type === 'url' ? (
                      <a href={b.url} target="_blank" rel="noreferrer" className="max-w-xs truncate text-primary hover:underline">{b.url}</a>
                    ) : (
                      <span className="text-zinc-400">resposta rápida</span>
                    )}
                    {b.next && <span className="text-zinc-400">→ {b.next}</span>}
                    <span className="inline-flex items-center gap-1 text-zinc-500">
                      <MousePointerClick className="h-3 w-3" />
                      {countEvent(stats, b.id, ['postback', 'link_click'])} cliques
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {node.type === 'condition' && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Segue a conta? <span className="text-zinc-400">Sim →</span> {node.onTrue ?? 'fim'} · <span className="text-zinc-400">Não →</span> {node.onFalse ?? 'fim'}
          </p>
        )}
        {node.type === 'http' && (
          <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-mono text-xs text-zinc-500">{node.method ?? 'POST'}</span> {node.url}
          </p>
        )}
        {node.type === 'delay' && <p className="text-sm text-zinc-700 dark:text-zinc-300">{describeDelay(node)}</p>}
        {node.type !== 'condition' && node.next && <p className="mt-2 text-xs text-zinc-400">Depois → {node.next}</p>}
      </div>
    </div>
  );
}

function RunsTable({
  runs,
  nodes,
  channelName,
}: {
  runs: IgFlowRun[];
  nodes: IgFlowNode[];
  channelName: (id: string) => string;
}) {
  const nodeType = (id: string | null) => nodes.find((n) => n.id === id)?.type ?? 'message';
  const [status, setStatus] = useState<IgFlowRunStatus | null>(null);
  const filtered = useMemo(() => (status ? runs.filter((r) => r.status === status) : runs), [runs, status]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Execuções recentes</h2>
        <span className="text-xs text-zinc-400">últimas {runs.length}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          <FilterChip active={status === null} onClick={() => setStatus(null)} label="Todas" />
          {RUN_STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)} label={RUN_STATUS_LABEL[s]} />
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 font-medium">Pessoa</th>
              <th className="px-3 py-2 font-medium">Comentário</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Passo</th>
              <th className="px-3 py-2 font-medium">Início</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">Nenhuma execução</td>
              </tr>
            ) : (
              filtered.map((run) => {
                const error = lastError(run);
                return (
                  <tr key={run.id} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{run.contactUsername ? `@${run.contactUsername}` : run.contactExternalId}</p>
                      <p className="text-[11px] text-zinc-400">{channelName(run.channelId)}</p>
                    </td>
                    <td className="max-w-xs px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      <p className="line-clamp-2">{run.triggerText ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${RUN_STATUS_CLASS[run.status]}`}>
                        {run.status === 'WAITING'
                          ? parkedLabel(run.status, nodeType(run.currentNodeId)).replace(/^./, (c) => c.toUpperCase())
                          : RUN_STATUS_LABEL[run.status]}
                      </span>
                      {error && <p className="mt-1 max-w-xs text-[11px] text-red-600 dark:text-red-400" title={error}>{error}</p>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">{run.currentNodeId ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDateTime(run.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}
    >
      {label}
    </button>
  );
}
