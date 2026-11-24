'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Bot, ChevronDown, Search, Check, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  inboxService,
  type Conversation,
} from '../services/inbox.service';
import {
  aiAgentsService,
  type AiAgent,
} from '@/features/ai-agents/services/ai-agents.service';
import { normalizeSearchText, textIncludes } from '@/lib/search';

interface Props {
  conversation: Conversation;
  onChanged?: () => void;
}

const KIND_BADGE: Record<string, string> = {
  ORCHESTRATOR:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  WORKER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export function AgentPinPopover({ conversation, onChanged }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => aiAgentsService.list(),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return agents
      .filter((a) => a.isActive)
      .filter((a) =>
        q
          ? textIncludes(a.name, q) || textIncludes(a.description, q)
          : true,
      );
  }, [agents, search]);

  const currentAgent = useMemo(() => {
    if (!conversation.activeAgentId) return null;
    return agents.find((a) => a.id === conversation.activeAgentId) ?? null;
  }, [agents, conversation.activeAgentId]);

  const handlePin = async (agent: AiAgent, closeFn: () => void) => {
    setBusyId(agent.id);
    try {
      const result = await inboxService.setActiveAgent(
        conversation.id,
        agent.id,
      );
      if (result.engaged) {
        toast.success(`${agent.name} assumiu a conversa`);
      } else {
        toast.info(
          `${agent.name} marcado como ativo, mas não engajou (${result.reason})`,
        );
      }
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      onChanged?.();
      closeFn();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao trocar agent');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Popover className="relative">
      <PopoverButton className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30">
        <Sparkles className="h-3.5 w-3.5" />
        {currentAgent ? (
          <span className="max-w-[120px] truncate">{currentAgent.name}</span>
        ) : (
          <span>IA</span>
        )}
        <ChevronDown className="h-3 w-3 text-violet-400" />
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        transition
        className="z-50 mt-1.5 w-72 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900 [--anchor-gap:0.25rem]"
      >
        {({ close }) => (
          <>
            <div className="px-2 py-1.5">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Quem responde essa conversa
              </p>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar agente…"
                  className="w-full rounded-md border border-zinc-200 bg-white py-1 pl-7 pr-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-2 py-3 text-center text-[11px] text-zinc-400">
                  Nenhum agente
                </p>
              )}
              {filtered.map((a) => {
                const isCurrent = a.id === conversation.activeAgentId;
                const isPending = busyId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => handlePin(a, close)}
                    disabled={isPending || isCurrent}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                      isCurrent
                        ? 'bg-primary/10 dark:bg-primary/20'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                      <Bot className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {a.name}
                        </p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${
                            KIND_BADGE[a.kind] ?? KIND_BADGE.WORKER
                          }`}
                        >
                          {a.kind === 'ORCHESTRATOR' ? 'orq' : 'wkr'}
                        </span>
                      </div>
                      {a.description && (
                        <p className="truncate text-[10px] text-zinc-500">
                          {a.description}
                        </p>
                      )}
                    </div>
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                    ) : isCurrent ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
