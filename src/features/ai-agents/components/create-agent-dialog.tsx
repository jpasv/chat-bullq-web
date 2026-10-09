'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  aiAgentsService,
  CURATED_MODELS,
  DEFAULT_AGENT_MODEL,
  DEPARTMENTS,
  type AgentKind,
} from '../services/ai-agents.service';
import { useOrgId } from '@/hooks/use-org-query-key';

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const agentSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(80, 'O nome deve ter no máximo 80 caracteres'),
  systemPrompt: z.string().trim().min(10, 'O prompt deve ter pelo menos 10 caracteres'),
});

const DEFAULT_PROMPT = `Você é o(a) atendente da empresa. Sua missão é responder os clientes com simpatia, agilidade e clareza.

Regras:
- Use apenas as informações que você sabe com certeza.
- Se o cliente pedir algo fora do seu conhecimento, transfira para um humano.
- Mantenha tom natural e direto, sem rebuscar.`;

export function CreateAgentDialog({
  open,
  onClose,
  onCreated,
}: CreateAgentDialogProps) {
  const orgId = useOrgId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<AgentKind>('WORKER');
  const [category, setCategory] = useState('');
  const [modelId, setModelId] = useState(DEFAULT_AGENT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [temperature, setTemperature] = useState(0.7);
  const [parentAgentId, setParentAgentId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [squad, setSquad] = useState('');
  const [saving, setSaving] = useState(false);

  // Load existing agents for the "reports to" dropdown.
  // Only enabled while dialog is open to avoid unnecessary fetches.
  const { data: agents } = useQuery({
    queryKey: ['ai-agents', orgId],
    queryFn: () => aiAgentsService.list(),
    enabled: open,
  });

  useEffect(() => {
    // When user picks ORCHESTRATOR, default parent to none and department
    // to leave the org root unconstrained — orchestrators usually report
    // straight to the human owner, not another agent.
    if (kind === 'ORCHESTRATOR' && parentAgentId) {
      setParentAgentId('');
    }
  }, [kind, parentAgentId]);

  if (!open) return null;

  const handleSave = async () => {
    const validation = agentSchema.safeParse({ name, systemPrompt });
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await aiAgentsService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
        category: category.trim() || undefined,
        modelId,
        systemPrompt: systemPrompt.trim(),
        temperature,
        parentAgentId: parentAgentId || null,
        department: department || null,
        squad: squad.trim() || null,
      });
      toast.success('Agente criado!');
      reset();
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Erro ao criar',
      );
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setName('');
    setDescription('');
    setKind('WORKER');
    setCategory('');
    setModelId(DEFAULT_AGENT_MODEL);
    setSystemPrompt(DEFAULT_PROMPT);
    setTemperature(0.7);
    setParentAgentId('');
    setDepartment('');
    setSquad('');
  };

  // Eligible parents: any agent in the org (the list endpoint already
  // filters soft-deleted ones). Workers can report to workers (multi-level).
  const eligibleParents = agents ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Novo agente
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Nome *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Vendas Bravy"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Descrição (interna)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Responde dúvidas sobre planos e fecha matrícula"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Tipo
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AgentKind)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="WORKER">Worker (atende o cliente)</option>
                <option value="ORCHESTRATOR">
                  Orquestrador (roteia para workers)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Categoria
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="vendas / suporte / billing"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Organograma matricial ágil */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Organograma
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Define hierarquia (chefia direta), departamento e squad ágil.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Reporta a (chefe direto)
                </label>
                <select
                  value={parentAgentId}
                  onChange={(e) => setParentAgentId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">— Raiz / sem chefe (CEO virtual) —</option>
                  {eligibleParents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.kind === 'ORCHESTRATOR' ? '(Orquestrador)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Departamento
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">— Não definido —</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Squad ágil
                  </label>
                  <input
                    type="text"
                    value={squad}
                    onChange={(e) => setSquad(e.target.value)}
                    placeholder="Ex: Inbound B2C"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Modelo *
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {CURATED_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.badge}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-500">
              Sugestão: Fugu Ultra para conversas; Fugu para tarefas internas simples.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              System prompt *
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Você não precisa repetir contexto da empresa — o sistema injeta nome, canal, hora, dados do contato e memória automaticamente.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Criatividade ({temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              <span>Determinístico</span>
              <span>Criativo</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Criando…' : 'Criar agente'}
          </button>
        </div>
      </div>
    </div>
  );
}
