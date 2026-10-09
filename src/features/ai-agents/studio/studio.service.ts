import { api } from '@/lib/api';

export type MentionType = 'agent' | 'tag' | 'department' | 'stage' | 'action' | 'media';
export interface MentionOption { type: MentionType; id: string; label: string; hint: string }

export interface TestChatTurn { role: 'user' | 'assistant'; content: string }
export interface TestChatResult {
  agent: { id: string; name: string };
  source: 'rascunho' | 'publicado';
  reply: string;
  actions: { tool: string; description: string; args: Record<string, unknown>; simulated: boolean; result?: { message: string; excerpts: { title: string; section: string; content: string; score: number }[] } }[];
  handoffTo: { id: string; name: string } | null;
  invalidMentions: string[];
  ms: number;
  tokens: { input: number; output: number };
}

export const studioService = {
  async mentionOptions(): Promise<MentionOption[]> {
    const { data } = await api.get('/ai-agents/mention-options');
    return data.data ?? data;
  },
  async testChat(agentId: string, messages: TestChatTurn[], useDraft: boolean, sessionId: string, signal?: AbortSignal): Promise<TestChatResult> {
    const { data } = await api.post(`/ai-agents/${agentId}/test-chat`, { messages, useDraft, sessionId }, { timeout: 120_000, signal });
    return data.data ?? data;
  },
};

/* ── Menções: o prompt guarda @[Rótulo](tipo:id); o editor mostra @[Rótulo]. ── */

const RAW_RE = /@\[([^\]\n]{1,80})\]\((agent|tag|department|stage|action|media):([A-Za-z0-9_-]{1,64})\)/g;
const DISPLAY_RE = /@\[([^\]\n]{1,240})\](?!\()/g;

export interface MentionRef { type: MentionType; id: string; label?: string }

/** Toda referência tem um rótulo visual exclusivo; nunca inferimos um id ambíguo. */
export function registerMention(label: string, ref: MentionRef, refs: Map<string, MentionRef>): string {
  const existing = [...refs].find(([, r]) => r.type === ref.type && r.id === ref.id && r.label === label);
  if (existing) return existing[0];
  let display = label;
  if (refs.has(display) && (refs.get(display)!.type !== ref.type || refs.get(display)!.id !== ref.id)) {
    display = `${label} · ${MENTION_STYLE[ref.type].name}`;
    if (refs.has(display) && (refs.get(display)!.type !== ref.type || refs.get(display)!.id !== ref.id)) display += ` · ${ref.id}`;
    while (refs.has(display) && (refs.get(display)!.type !== ref.type || refs.get(display)!.id !== ref.id)) display += ' ·';
  }
  refs.set(display, { ...ref, label });
  return display;
}
function resolveMention(label: string, refs: Map<string, MentionRef>, options: MentionOption[]): MentionRef | undefined {
  const ref = refs.get(label);
  if (ref) return ref;
  const matches = options.filter(o => o.label === label);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Converte o prompt salvo para o texto do editor e devolve o mapa rótulo → registro. */
export function toDisplay(raw: string): { text: string; refs: Map<string, MentionRef> } {
  const refs = new Map<string, MentionRef>();
  const text = (raw ?? '').replace(RAW_RE, (_m, label: string, type: MentionType, id: string) => {
    const display = registerMention(label.trim(), { type, id }, refs);
    return `@[${display}]`;
  });
  return { text, refs };
}

/** Converte o texto do editor de volta para o formato salvo. */
export function toRaw(text: string, refs: Map<string, MentionRef>, options: MentionOption[]): string {
  return text.replace(DISPLAY_RE, (m, label: string) => {
    const key = label.trim();
    const ref = resolveMention(key, refs, options);
    return ref ? `@[${ref.label ?? key}](${ref.type}:${ref.id})` : m;
  });
}

export interface MentionChip { label: string; type: MentionType | null; valid: boolean }

/** Lista as menções do texto do editor com o estado de cada uma. */
export function listMentions(text: string, refs: Map<string, MentionRef>, options: MentionOption[]): MentionChip[] {
  const seen = new Map<string, MentionChip>();
  for (const m of text.matchAll(DISPLAY_RE)) {
    const label = m[1].trim();
    const ref = resolveMention(label, refs, options);
    const valid = !!ref && options.some(o => o.type === ref.type && o.id === ref.id);
    seen.set(label, { label, type: ref?.type ?? null, valid });
  }
  return [...seen.values()];
}

export const MENTION_STYLE: Record<MentionType, { chip: string; name: string }> = {
  agent: { chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', name: 'agente' },
  tag: { chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', name: 'etiqueta' },
  department: { chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', name: 'departamento' },
  stage: { chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', name: 'etapa' },
  action: { chip: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100', name: 'ação' },
  media: { chip: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100', name: 'mídia' },
};

/* ── Fluxo entre agentes, derivado das menções @agente nos prompts publicados ── */

const AGENT_RE = /@\[[^\]\n]{1,80}\]\(agent:([A-Za-z0-9_-]{1,64})\)/g;

/** Para cada agente, os agentes que ele cita (para quem pode passar a conversa). */
export function agentLinks(agents: { id: string; systemPrompt?: string | null }[]): Map<string, string[]> {
  const ids = new Set(agents.map(a => a.id));
  return new Map(agents.map(a => [a.id, [...new Set([...(a.systemPrompt ?? '').matchAll(AGENT_RE)].map(m => m[1]))].filter(id => id !== a.id && ids.has(id))]));
}

/**
 * Etapa de cada membro da matéria: 1 = agente inicial, 2 = citado pelo inicial,
 * e assim por diante (seguindo só agentes da própria matéria). Sem etapa =
 * ninguém da matéria passa a conversa para ele.
 */
export function stepsInGroup(initialId: string, memberIds: string[], links: Map<string, string[]>): Map<string, number> {
  const members = new Set(memberIds);
  const steps = new Map<string, number>([[initialId, 1]]);
  let frontier = [initialId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) for (const t of links.get(id) ?? []) {
      if (members.has(t) && !steps.has(t)) { steps.set(t, steps.get(id)! + 1); next.push(t); }
    }
    frontier = next;
  }
  return steps;
}
