import type { IgFlow, IgFlowNode, IgFlowRunStatus } from '../services/ig-flows.service';

export const RUN_STATUS_LABEL: Record<IgFlowRunStatus, string> = {
  RUNNING: 'Executando',
  WAITING: 'Aguardando',
  WAITING_INTERACTION: 'Aguardando resposta',
  DONE: 'Concluído',
  FAILED: 'Falhou',
};

export const RUN_STATUS_CLASS: Record<IgFlowRunStatus, string> = {
  RUNNING: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  WAITING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  WAITING_INTERACTION: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

/** Rótulo de quem está parado num nó: WAITING é clique em mensagem e horário em delay. */
export function parkedLabel(status: IgFlowRunStatus, nodeType: IgFlowNode['type']): string {
  if (status === 'WAITING') return nodeType === 'delay' ? 'aguardando horário' : 'aguardando clique';
  return RUN_STATUS_LABEL[status].toLowerCase();
}

export const TRIGGER_LABEL: Record<string, string> = {
  COMMENT: 'Comentário em post',
  STORY_REPLY: 'Resposta a story',
};

export const NODE_TYPE_LABEL: Record<IgFlowNode['type'], string> = {
  message: 'Mensagem',
  condition: 'Condição',
  http: 'Requisição HTTP',
  delay: 'Espera',
};

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export function describeDelay(node: Extract<IgFlowNode, { type: 'delay' }>): string {
  if (node.dailyAt) {
    const grace = node.graceMinutes ? ` (tolerância ${node.graceMinutes} min)` : '';
    return `Todo dia às ${node.dailyAt}${grace}`;
  }
  if (node.until) return `Até ${formatDateTime(node.until)}`;
  const s = node.seconds ?? 0;
  if (s >= 3600) return `${+(s / 3600).toFixed(1)} h`;
  if (s >= 60) return `${Math.round(s / 60)} min`;
  return `${s} s`;
}

/** Ids dos nós para onde um nó pode seguir, na ordem em que aparecem. */
export function nextNodeIds(node: IgFlowNode): string[] {
  const ids: (string | undefined)[] = [];
  if (node.type === 'message') {
    for (const b of node.buttons ?? []) ids.push(b.next);
    ids.push(node.next);
  } else if (node.type === 'condition') {
    ids.push(node.onTrue, node.onFalse);
  } else {
    ids.push(node.next);
  }
  return ids.filter((id): id is string => !!id);
}

/** Nós na ordem do fluxo (a partir do início); os soltos vão pro fim, marcados. */
export function orderNodes(flow: IgFlow): { node: IgFlowNode; reachable: boolean }[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const ordered: { node: IgFlowNode; reachable: boolean }[] = [];
  const visit = (id: string) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    ordered.push({ node, reachable: true });
    nextNodeIds(node).forEach(visit);
  };
  visit(flow.startNodeId);
  for (const node of flow.nodes) {
    if (!seen.has(node.id)) ordered.push({ node, reachable: false });
  }
  return ordered;
}
