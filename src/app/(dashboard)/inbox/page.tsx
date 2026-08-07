'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { ConversationList } from '@/features/inbox/components/conversation-list';
import { ChatPanel } from '@/features/inbox/components/chat-panel';
import { AgentRunsSidebar } from '@/features/inbox/components/agent-runs-sidebar';
import { ProjectPanel } from '@/features/inbox/components/project-panel';
import { inboxService, type Conversation } from '@/features/inbox/services/inbox.service';

const AGENT_LOGS_PREF_KEY = 'inbox.agentLogsOpen';
const PROJECT_PANEL_PREF_KEY = 'inbox.projectPanelOpen';

export default function InboxPage() {
  const searchParams = useSearchParams();
  const viewId = searchParams.get('view');
  const deepLinkConvId = searchParams.get('conversationId');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  // Persisted across sessions via localStorage so each operator keeps their
  // preferred layout (some live with the sidebar open, others want the chat
  // full width). Read on mount, write whenever it flips.
  const [agentLogsOpen, setAgentLogsOpen] = useState(false);
  useEffect(() => {
    try {
      setAgentLogsOpen(localStorage.getItem(AGENT_LOGS_PREF_KEY) === '1');
    } catch {
      // SSR / privacy mode — fine, defaults to closed.
    }
  }, []);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  useEffect(() => {
    try {
      setProjectPanelOpen(localStorage.getItem(PROJECT_PANEL_PREF_KEY) === '1');
    } catch {
      // SSR / privacy mode — fine, defaults to closed.
    }
  }, []);
  // Logs e Projeto são mutuamente exclusivos (largura): abrir um fecha o outro.
  const toggleAgentLogs = useCallback(() => {
    setAgentLogsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AGENT_LOGS_PREF_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage failures — runtime state still flips.
      }
      if (next) {
        setProjectPanelOpen(false);
        try {
          localStorage.setItem(PROJECT_PANEL_PREF_KEY, '0');
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);
  const toggleProjectPanel = useCallback(() => {
    setProjectPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PROJECT_PANEL_PREF_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      if (next) {
        setAgentLogsOpen(false);
        try {
          localStorage.setItem(AGENT_LOGS_PREF_KEY, '0');
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);
  const queryClient = useQueryClient();

  // Switching inbox view should clear the open conversation so the right
  // panel doesn't show a thread that may not even match the new filter.
  useEffect(() => {
    setActiveConversation(null);
  }, [viewId]);

  // Deep-link from elsewhere (e.g. Jarvis Execuções drawer): when the URL
  // carries ?conversationId=..., resolve it once and open in the chat panel.
  // We don't loop on it — the user clicking another thread should override.
  useEffect(() => {
    if (!deepLinkConvId) return;
    if (activeConversation?.id === deepLinkConvId) return;
    let cancelled = false;
    inboxService
      .getConversation(deepLinkConvId)
      .then((conv) => {
        if (!cancelled) setActiveConversation(conv);
      })
      .catch(() => {
        // Silent — broken link shouldn't break the inbox; user still sees
        // the list and can pick another conversation.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkConvId]);

  // Keep the active conversation object in sync with the backend (enrichment, last message, etc.)
  const { data: freshActive } = useQuery({
    queryKey: ['conversation', activeConversation?.id],
    queryFn: () => inboxService.getConversation(activeConversation!.id),
    enabled: !!activeConversation?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (freshActive && freshActive.id === activeConversation?.id) {
      setActiveConversation(freshActive);
    }
  }, [freshActive, activeConversation?.id]);

  const handleConversationUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (activeConversation) {
      queryClient.invalidateQueries({
        queryKey: ['messages', activeConversation.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['conversation', activeConversation.id],
      });
    }
  }, [queryClient, activeConversation]);

  return (
    <div className="flex h-full">
      <ConversationList
        activeId={activeConversation?.id || null}
        onSelect={setActiveConversation}
        viewId={viewId}
      />

      {activeConversation ? (
        <>
          <ChatPanel
            key={activeConversation.id}
            conversation={activeConversation}
            onConversationUpdate={handleConversationUpdate}
            onToggleAgentLogs={toggleAgentLogs}
            agentLogsOpen={agentLogsOpen}
            onToggleProject={toggleProjectPanel}
            projectOpen={projectPanelOpen}
          />
          {agentLogsOpen && (
            <AgentRunsSidebar
              key={`logs-${activeConversation.id}`}
              conversationId={activeConversation.id}
              onClose={toggleAgentLogs}
            />
          )}
          {projectPanelOpen && activeConversation.isGroup && (
            <ProjectPanel
              key={`project-${activeConversation.id}`}
              conversationId={activeConversation.id}
              onClose={toggleProjectPanel}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <MessageSquare className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            Chat Conect
          </h2>
          <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            Selecione uma conversa para começar
          </p>
        </div>
      )}
    </div>
  );
}
