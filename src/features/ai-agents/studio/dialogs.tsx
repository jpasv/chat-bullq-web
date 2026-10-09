'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog as AccessibleDialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { aiAgentsService, AiAgent, DEFAULT_AGENT_MODEL } from '../services/ai-agents.service';
import { AgentGroup, agentGroupsService } from '../services/agent-groups.service';

export const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400';
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800';

export function Dialog({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AccessibleDialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-md rounded-xl border border-zinc-300 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</DialogTitle>
              {description && <Description className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{description}</Description>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
          </div>
          {children}
        </DialogPanel>
      </div>
    </AccessibleDialog>
  );
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-100">
      {children}{hint && <span className="ml-1 font-normal text-zinc-600 dark:text-zinc-400">({hint})</span>}
    </span>
  );
}

/** Nova matéria/tese. Toda matéria precisa de um agente inicial: novo ou existente. */
export function NewGroupDialog({ agents, groups, onClose, onCreated }: {
  agents: AiAgent[]; groups: AgentGroup[]; onClose: () => void; onCreated: (agentId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'TESE' | 'SUPORTE'>('TESE');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [agentName, setAgentName] = useState('');
  const [existingId, setExistingId] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Agente inicial de outra matéria com mais membros não pode sair de lá sem deixá-la sem inicial.
  const blocked = new Set(groups.filter(g => g.members.length > 1).map(g => g.initialAgentId));
  const candidates = agents.filter(a => !blocked.has(a.id));

  const submit = async () => {
    const title = name.trim();
    if (!title) return toast.error('Informe o nome da matéria.');
    if (mode === 'existing' && !existingId) return toast.error('Escolha o agente inicial.');
    setBusy(true);
    try {
      let initialId = existingId;
      if (mode === 'new') {
        const n = agentName.trim() || `Triagem ${title}`;
        const created = await aiAgentsService.create({ name: n, modelId: DEFAULT_AGENT_MODEL, systemPrompt: `Você é o agente ${n} do escritório. Descreva aqui como ele deve atender.` });
        initialId = created.id;
      }
      await agentGroupsService.save({ kind, name: title, description: description.trim() || null, initialAgentId: initialId, memberIds: [initialId] });
      toast.success(`Matéria "${title}" criada.`);
      onCreated(initialId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível criar a matéria. Confira os dados e tente de novo.');
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="Nova matéria" description="Agrupe os agentes de uma tese, como BPC/LOAS, Auxílio-doença ou Trabalhista." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-4">
        <label className="block"><Label>Tipo</Label><select value={kind} onChange={e => setKind(e.target.value as 'TESE' | 'SUPORTE')} className={inputCls}><option value="TESE">Tese</option><option value="SUPORTE">Suporte</option></select></label>
        <label className="block"><Label>Nome da matéria</Label>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: BPC/LOAS" className={inputCls} /></label>
        <label className="block"><Label hint="opcional">Descrição</Label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Para que serve esta matéria" className={inputCls} /></label>
        <fieldset className="space-y-2">
          <Label>Agente inicial</Label>
          <p className="-mt-1 text-xs text-zinc-600 dark:text-zinc-400">É quem atende primeiro quando a conversa chega por um número desta matéria.</p>
          <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Criar um agente novo</label>
          {mode === 'new' && <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder={`Triagem ${name.trim() || 'da matéria'}`} className={inputCls} />}
          <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100"><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} disabled={!candidates.length} /> Usar um agente existente</label>
          {mode === 'existing' && (
            <select value={existingId} onChange={e => setExistingId(e.target.value)} className={inputCls}>
              <option value="">Escolha o agente</option>
              {candidates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar matéria</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewAgentDialog({ groups, defaultGroupId, onClose, onCreated }: {
  groups: AgentGroup[]; defaultGroupId?: string; onClose: () => void; onCreated: (agentId: string) => void;
}) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2) return toast.error('O nome precisa de pelo menos 2 caracteres.');
    setBusy(true);
    try {
      const agent = await aiAgentsService.create({ name: n, modelId: DEFAULT_AGENT_MODEL, systemPrompt: `Você é o agente ${n} do escritório. Descreva aqui como ele deve atender.` });
      const g = groups.find(x => x.id === groupId);
      if (g) await agentGroupsService.moveAgent(agent.id, g.id);
      toast.success(`Agente "${n}" criado como rascunho.`);
      onCreated(agent.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Não foi possível criar o agente. Tente de novo.');
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="Novo agente" description="Cada agente cuida de uma etapa. Ex.: Triagem, Análise de saúde, Análise de renda." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-4">
        <label className="block"><Label>Nome do agente</Label>
          <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Análise de renda" className={inputCls} /></label>
        <label className="block"><Label>Matéria</Label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} className={inputCls}>
            <option value="">Sem matéria</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar agente</button>
        </div>
      </form>
    </Dialog>
  );
}

export function PublishDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Publicar agente" description="A nova versão passa a valer para os clientes assim que for publicada." onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onConfirm(note.trim()); } finally { setBusy(false); } }} className="space-y-4">
        <label className="block"><Label hint="opcional">O que mudou</Label>
          <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: pergunta a renda antes da idade" className={inputCls} /></label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Publicar</button>
        </div>
      </form>
    </Dialog>
  );
}

export const dangerBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950';

export function ConfirmDialog({ title, description, confirmLabel, onClose, onConfirm, children }: {
  title: string; description: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void>; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} description={description} onClose={onClose}>
      {children}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/** Editar matéria: nome, descrição, agente inicial e exclusão. */
export function EditGroupDialog({ group, onClose, onSaved }: { group: AgentGroup; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [kind, setKind] = useState<'TESE' | 'SUPORTE'>(group.kind ?? 'TESE');
  const [initialId, setInitialId] = useState(group.initialAgentId);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error('Informe o nome da matéria.');
    setBusy(true);
    try {
      await agentGroupsService.save({ kind, name: name.trim(), description: description.trim() || null, initialAgentId: initialId, memberIds: group.members.map(m => m.agentId) }, group.id);
      toast.success('Matéria salva.'); onSaved();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível salvar a matéria.'); }
    finally { setBusy(false); }
  };

  if (confirmDelete) return (
    <ConfirmDialog title={`Excluir a matéria "${group.name}"?`} confirmLabel="Excluir matéria" onClose={() => setConfirmDelete(false)}
      description="Os agentes não são apagados: passam para “Sem matéria”. Números ligados a esta matéria deixam de ter agente inicial."
      onConfirm={async () => {
        try { await agentGroupsService.remove(group.id); toast.success('Matéria excluída.'); onSaved(); }
        catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível excluir a matéria.'); }
      }} />
  );

  return (
    <Dialog title="Editar matéria" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4">
        <label className="block"><Label>Tipo</Label><select value={kind} onChange={e => setKind(e.target.value as 'TESE' | 'SUPORTE')} className={inputCls}><option value="TESE">Tese</option><option value="SUPORTE">Suporte</option></select></label>
        <label className="block"><Label>Nome da matéria</Label><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></label>
        <label className="block"><Label hint="opcional">Descrição</Label><input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} /></label>
        <label className="block"><Label>Agente inicial</Label>
          <select value={initialId} onChange={e => setInitialId(e.target.value)} className={inputCls}>
            {group.members.map(m => <option key={m.agentId} value={m.agentId}>{m.agent.name}</option>)}
          </select></label>
        <div className="flex items-center justify-between gap-2 pt-2">
          <button type="button" onClick={() => setConfirmDelete(true)} className={dangerBtn}>Excluir matéria</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
