'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FlaskConical, FolderPlus, Images, Loader2, Pencil, Plus, Search, Star } from 'lucide-react';
import { KnowledgeLibraryDialog } from './knowledge-library';
import { MediaLibraryDialog } from './media-library';
import { useOrgId } from '@/hooks/use-org-query-key';
import { aiAgentsService, AiAgent } from '../services/ai-agents.service';
import { agentGroupsService } from '../services/agent-groups.service';
import { AgentEditor } from './agent-editor';
import { TestChat } from './test-chat';
import { agentLinks, stepsInGroup, studioService } from './studio.service';
import { EditGroupDialog, NewAgentDialog, NewGroupDialog, primaryBtn, secondaryBtn } from './dialogs';

/**
 * Estúdio de agentes (estilo LíderHub): matérias/teses à esquerda com seus
 * agentes, o agente aberto no centro e o chat de teste à direita.
 */
export function StudioPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const openAgent = (id: string) => {
    if (id === selectedId) return;
    if (editorDirty && !window.confirm('Descartar alterações não salvas e abrir outro agente?')) return;
    setEditorDirty(false); setSelectedId(id);
  };
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showChat, setShowChat] = useState(true);
  const [dialog, setDialog] = useState<{ kind: 'group' } | { kind: 'agent'; groupId?: string } | { kind: 'editGroup'; groupId: string } | { kind: 'media' } | { kind: 'knowledge' } | null>(null);

  const agentsQ = useQuery({ queryKey: ['ai-agents', orgId], queryFn: () => aiAgentsService.list() });
  const groupsQ = useQuery({ queryKey: ['ai-agent-groups', orgId], queryFn: () => agentGroupsService.list() });
  const optionsQ = useQuery({ queryKey: ['mention-options', orgId], queryFn: () => studioService.mentionOptions() });
  const agentQ = useQuery({ queryKey: ['studio-agent', selectedId], queryFn: () => aiAgentsService.findOne(selectedId!), enabled: !!selectedId });

  const allAgents = (agentsQ.data ?? []) as AiAgent[];
  const q = search.trim().toLowerCase();
  const agents = useMemo(() => allAgents.filter(a => a.name.toLowerCase().includes(q)), [allAgents, q]);
  const groups = groupsQ.data ?? [];
  const grouped = new Set(groups.flatMap(g => g.members.map(m => m.agentId)));
  const ungrouped = agents.filter(a => !grouped.has(a.id));
  const links = useMemo(() => agentLinks(allAgents), [allAgents]);
  const groupOf = (id: string) => groups.find(g => g.members.some(m => m.agentId === id));
  const nameOf = (id: string) => allAgents.find(a => a.id === id)?.name ?? 'agente removido';
  const flowFor = (id: string) => ({
    passesTo: (links.get(id) ?? []).map(t => ({ id: t, name: nameOf(t), group: groupOf(t)?.name ?? null, sameGroup: groupOf(t)?.id === groupOf(id)?.id })),
    receivesFrom: [...links].filter(([, ts]) => ts.includes(id)).map(([from]) => ({ id: from, name: nameOf(from), group: groupOf(from)?.name ?? null, sameGroup: groupOf(from)?.id === groupOf(id)?.id })),
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['ai-agents'] });
    void qc.invalidateQueries({ queryKey: ['ai-agent-groups'] });
    void qc.invalidateQueries({ queryKey: ['mention-options'] });
    void qc.invalidateQueries({ queryKey: ['studio-revisions'] });
  };
  const created = (agentId: string) => { setDialog(null); refreshAll(); openAgent(agentId); };
  const toggle = (id: string) => setCollapsed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const AgentRow = ({ a, initial, step, external }: { a: { id: string; name: string; publishedRevisionId?: string | null }; initial?: boolean; step?: number | null; external?: number }) => {
    const active = selectedId === a.id;
    return (
      <button type="button" onClick={() => openAgent(a.id)} aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active
          ? 'bg-primary/15 font-semibold text-zinc-950 dark:text-white'
          : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'}`}>
        {step != null && (
          <span title={initial ? 'Atende primeiro' : `Recebe a conversa na etapa ${step}`}
            className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 text-xs font-semibold ${initial ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100' : 'bg-violet-100 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100'}`}>
            {initial && <Star className="h-3 w-3 fill-amber-500 text-amber-500" />}{step}º
          </span>
        )}
        {step === null && <span title="Nenhum agente desta matéria cita este agente" className="shrink-0 rounded-full border border-dashed border-zinc-400 px-1.5 text-xs text-zinc-600 dark:border-zinc-500 dark:text-zinc-300">–</span>}
        <span className="truncate">{a.name}</span>
        {!!external && <span title="Também passa a conversa para agente de outra matéria" className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">↗ outra matéria</span>}
        {!a.publishedRevisionId && <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">rascunho</span>}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-zinc-950">
      <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-300 dark:border-zinc-700">
        <div className="space-y-3 border-b border-zinc-300 p-4 dark:border-zinc-700">
          <h1 className="text-base font-semibold text-zinc-950 dark:text-white">Agentes de IA</h1>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDialog({ kind: 'group' })} className={`${secondaryBtn} px-2`}><FolderPlus className="h-4 w-4" /> Nova matéria</button>
            <button type="button" onClick={() => setDialog({ kind: 'agent' })} className={`${primaryBtn} px-2`}><Plus className="h-4 w-4" /> Novo agente</button>
          </div>
          <label className="relative block">
            <span className="sr-only">Buscar agente</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar agente"
              className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-8 pr-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-primary dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400" />
          </label>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Matérias e agentes">
          {(agentsQ.isLoading || groupsQ.isLoading) && <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-zinc-500" />}
          {(agentsQ.isError || groupsQ.isError) && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              Não foi possível carregar os agentes. <button className="font-semibold underline" onClick={refreshAll}>Tentar de novo</button>
            </p>
          )}

          {(['TESE', 'SUPORTE'] as const).map(kind => <div key={kind} className="space-y-4">
            <h2 className="px-1 text-sm font-semibold">{kind === 'SUPORTE' ? 'Suporte (atende todos os números)' : 'Teses'}</h2>
          {groups.filter(g => (g.kind ?? 'TESE') === kind).map(g => {
            const steps = stepsInGroup(g.initialAgentId, g.members.map(m => m.agentId), links);
            const members = g.members.filter(m => m.agent.name.toLowerCase().includes(q))
              .sort((x, y) => (steps.get(x.agentId) ?? 99) - (steps.get(y.agentId) ?? 99));
            const open = !collapsed.has(g.id);
            return (
              <section key={g.id}>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => toggle(g.id)} aria-expanded={open}
                    className="flex flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800">
                    {open ? <ChevronDown className="h-4 w-4 text-zinc-600 dark:text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />}
                    <span className="truncate">{g.name}</span>
                    <span className="ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-400">{g.members.length}</span>
                  </button>
                  <button type="button" onClick={() => setDialog({ kind: 'editGroup', groupId: g.id })} title={`Editar ${g.name}`} aria-label={`Editar matéria ${g.name}`}
                    className="rounded p-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setDialog({ kind: 'agent', groupId: g.id })} title={`Novo agente em ${g.name}`}
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                    <Plus className="h-3.5 w-3.5" /> Agente
                  </button>
                </div>
                {open && <div className="mt-1 space-y-0.5">{members.map(m => (
                  <AgentRow key={m.agentId} a={{ id: m.agentId, name: m.agent.name, publishedRevisionId: m.agent.publishedRevisionId }} initial={g.initialAgentId === m.agentId}
                    step={steps.get(m.agentId) ?? null} external={(links.get(m.agentId) ?? []).filter(t => groupOf(t)?.id !== g.id).length} />
                ))}</div>}
              </section>
            );
          })}
          </div>)}

          {ungrouped.length > 0 && (
            <section>
              <p className="px-1 py-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Sem matéria</p>
              <div className="mt-1 space-y-0.5">{ungrouped.map(a => <AgentRow key={a.id} a={a} />)}</div>
            </section>
          )}

          {!agentsQ.isLoading && !allAgents.length && (
            <div className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
              Nenhum agente ainda. Comece criando uma matéria, por exemplo BPC/LOAS; o primeiro agente é criado junto.
            </div>
          )}
        </nav>

        <button type="button" onClick={() => setDialog({ kind: 'knowledge' })} className={`${secondaryBtn} mx-3 mb-2`}>Base de conhecimento</button>
        <button type="button" onClick={() => setDialog({ kind: 'media' })} className="mx-3 mb-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800">
          <Images className="h-4 w-4" /> Biblioteca de mídias
        </button>
        <p className="flex items-start gap-1.5 border-t border-zinc-300 p-3 text-xs leading-5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />
          <span>O número é a etapa em que o agente entra: 1º atende primeiro, os seguintes recebem quando alguém os cita no prompt com @. Pode citar agentes de outras matérias.</span>
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        {!selectedId && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">Escolha um agente à esquerda</p>
            <p className="max-w-sm text-sm text-zinc-700 dark:text-zinc-300">Ou crie uma matéria para uma nova tese. Cada matéria reúne os agentes que atendem aquele assunto.</p>
            <button type="button" onClick={() => setDialog({ kind: 'group' })} className={primaryBtn}><FolderPlus className="h-4 w-4" /> Nova matéria</button>
          </div>
        )}
        {selectedId && agentQ.isFetching && <p role="status" className="flex items-center justify-center gap-2 p-6"><Loader2 className="h-5 w-5 animate-spin" /> Carregando agente…</p>}
        {selectedId && agentQ.isError && <div role="alert" className="p-6 text-red-700">
          Não foi possível carregar o agente. <button type="button" disabled={agentQ.isFetching} className="underline disabled:opacity-50" onClick={() => void agentQ.refetch()}>Tentar novamente</button>
        </div>}
        {selectedId && !agentQ.isFetching && !agentQ.isError && !agentQ.data && <div className="p-6"><p>Agente não encontrado.</p><button type="button" className="underline" onClick={() => void agentQ.refetch()}>Tentar novamente</button></div>}
        {selectedId && agentQ.data && (
          <AgentEditor key={agentQ.data.id} onDirtyChange={setEditorDirty}
            agent={agentQ.data} groups={groups} options={optionsQ.data ?? []} flow={flowFor(agentQ.data.id)} onOpenAgent={openAgent} onDeleted={() => { setEditorDirty(false); setSelectedId(null); refreshAll(); }} onChanged={() => { refreshAll(); void agentQ.refetch(); }} />
        )}
      </main>

      {selectedId && agentQ.data && (showChat ? (
        <aside className="flex w-96 shrink-0 flex-col border-l border-zinc-300 dark:border-zinc-700">
          <TestChat key={agentQ.data.id} revisionKey={JSON.stringify([agentQ.data.draftRevision, agentQ.data.publishedRevision])} agentId={agentQ.data.id} agentName={agentQ.data.name} />
          <button type="button" onClick={() => setShowChat(false)} className="border-t border-zinc-300 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Recolher chat de teste</button>
        </aside>
      ) : (
        <button type="button" onClick={() => setShowChat(true)} aria-label="Abrir chat de teste"
          className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-zinc-300 pt-4 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          <FlaskConical className="h-4 w-4" /><span className="text-xs [writing-mode:vertical-rl]">Chat de teste</span>
        </button>
      ))}

      {dialog?.kind === 'group' && <NewGroupDialog agents={allAgents} groups={groups} onClose={() => setDialog(null)} onCreated={created} />}
      {dialog?.kind === 'editGroup' && groups.find(g => g.id === dialog.groupId) && (
        <EditGroupDialog group={groups.find(g => g.id === dialog.groupId)!} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refreshAll(); }} />
      )}
      {dialog?.kind === 'knowledge' && <KnowledgeLibraryDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'media' && <MediaLibraryDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'agent' && <NewAgentDialog groups={groups} defaultGroupId={dialog.groupId} onClose={() => setDialog(null)} onCreated={created} />}
    </div>
  );
}
