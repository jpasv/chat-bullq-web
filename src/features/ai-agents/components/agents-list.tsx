'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { Bot, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  aiAgentsService,
  type AiAgent,
  DEPARTMENT_COLORS,
} from '../services/ai-agents.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { CreateAgentDialog } from './create-agent-dialog';
import { EditAgentDialog } from './edit-agent-dialog';
import { AgentNode, type AgentNodeData } from './agent-node';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 160;

const nodeTypes: NodeTypes = { agent: AgentNode };

/**
 * Computes top-down hierarchical positions for the agent organogram using
 * dagre. Nodes without a parent become roots; multiple roots stack
 * horizontally at depth 0. Department isn't fed into layout (would force
 * unrelated agents apart) — it's only a visual cue on each card.
 */
function layoutOrganogram(agents: AiAgent[]): {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    // Espaço entre nós irmãos (horizontal). Aumentar evita as edges
    // passarem por cima umas das outras quando 1 pai tem N filhos.
    nodesep: 100,
    // Espaço vertical entre níveis. Mais alto = mais "respiro" pras
    // linhas saírem retas antes de virar lateral.
    ranksep: 120,
    // Direciona o algoritmo a posicionar cada nó no centro do seu
    // pai (organograma "cartório") em vez de empilhar à esquerda.
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(agents.map((a) => a.id));

  for (const a of agents) {
    g.setNode(a.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const a of agents) {
    // Treat unknown parent as root (orphaned ref). Avoids broken edges
    // when an agent is hard-deleted but children weren't reparented.
    if (a.parentAgentId && ids.has(a.parentAgentId)) {
      g.setEdge(a.parentAgentId, a.id);
    }
  }

  dagre.layout(g);

  const nodes: Node<AgentNodeData>[] = agents.map((a) => {
    const pos = g.node(a.id);
    return {
      id: a.id,
      type: 'agent',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        agent: a,
        // overwritten by AgentsList with real handlers
        onClick: () => {},
        onToggleActive: () => {},
      },
      draggable: true,
    };
  });

  const edges: Edge[] = [];
  for (const a of agents) {
    if (a.parentAgentId && ids.has(a.parentAgentId)) {
      edges.push({
        id: `${a.parentAgentId}->${a.id}`,
        source: a.parentAgentId,
        target: a.id,
        // step (sem curvas) dá um L "engineering" tradicional pra
        // organograma; smoothstep com curvas faz N edges saindo do
        // mesmo handle se cruzarem visualmente perto do source.
        type: 'step',
        animated: false,
        style: { stroke: '#a1a1aa', strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

export function AgentsList() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AiAgent | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const { data: agents, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['ai-agents'] });

  const handleToggleActive = async (agent: AiAgent) => {
    try {
      await aiAgentsService.update(agent.id, { isActive: !agent.isActive });
      toast.success(agent.isActive ? 'Agente desativado' : 'Agente ativado');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alternar');
    }
  };

  // Distinct departments present, in stable order, for the filter chips.
  const departments = useMemo(() => {
    if (!agents) return [];
    return [
      ...new Set(
        agents
          .map((a) => a.department)
          .filter((d): d is string => !!d),
      ),
    ].sort();
  }, [agents]);

  const filtered = useMemo(() => {
    if (!agents) return [];
    if (!deptFilter) return agents;
    return agents.filter((a) => a.department === deptFilter);
  }, [agents, deptFilter]);

  const { nodes, edges } = useMemo(() => {
    const out = layoutOrganogram(filtered);
    // inject real handlers (memoized layout doesn't know them)
    return {
      nodes: out.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onClick: setEditing,
          onToggleActive: handleToggleActive,
        },
      })),
      edges: out.edges,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const hasAgents = (agents?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Organograma de agentes
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Hierarquia matricial — quem reporta a quem, agrupado por departamento
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo agente
        </button>
      </div>

      {departments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">Departamento:</span>
          <button
            onClick={() => setDeptFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              deptFilter === null
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            Todos
          </button>
          {departments.map((d) => {
            const c = DEPARTMENT_COLORS[d];
            const active = deptFilter === d;
            return (
              <button
                key={d}
                onClick={() => setDeptFilter(active ? null : d)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? `${c?.bg ?? 'bg-zinc-200'} ${c?.text ?? 'text-zinc-900'} ring-1 ${c?.ring ?? 'ring-zinc-300'}`
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-[640px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ) : isError ? (
          <div role="alert" className="col-span-full p-6 text-center text-sm text-zinc-500">
            <p>Não foi possível carregar agentes.</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 text-primary hover:underline">
              Tentar novamente
            </button>
          </div>
        ) : hasAgents ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              className="bg-zinc-50 dark:bg-zinc-950"
            >
              <Background gap={24} size={1} color="#e4e4e7" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  const a = (n.data as AgentNodeData).agent;
                  if (a.kind === 'ORCHESTRATOR') return '#6366f1';
                  if (a.department === 'VENDAS') return '#10b981';
                  if (a.department === 'SUPORTE') return '#3b82f6';
                  if (a.department === 'CS') return '#8b5cf6';
                  return '#a1a1aa';
                }}
                className="!bg-white dark:!bg-zinc-900"
              />
            </ReactFlow>
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-10">
            <div className="rounded-xl border-2 border-dashed border-zinc-200 p-16 dark:border-zinc-800">
              <Bot className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-center text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Nenhum agente cadastrado ainda
              </p>
              <p className="mt-1 max-w-md text-center text-xs text-zinc-400 dark:text-zinc-500">
                Crie um agente, dê a ele um system prompt e atribua a um canal —
                ele passa a responder automaticamente.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar primeiro agente
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refresh}
      />
      <EditAgentDialog
        agent={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}
