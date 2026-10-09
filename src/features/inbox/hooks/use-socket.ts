'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getSocket, getSocketAuthReady, subscribeSocketReady } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

// A sala ativa pertence ao inbox; o estado de autenticação pertence ao singleton.
let activeConversationId: string | null = null;

// Module-scope reconnect listeners. We call these whenever `ready` fires
// AFTER the first one — i.e. the user came back online. Each consumer
// hook subscribes once via `onReconnect`.
const reconnectListeners = new Set<() => void>();

function setActiveConversation(id: string | null) {
  activeConversationId = id;
}

function getActiveConversation(): string | null {
  return activeConversationId;
}

let subscribers = 0;
let unsubscribeReady: (() => void) | undefined;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleReady = (ready: boolean, isReconnect: boolean) => {
      if (!ready) return;
      const convId = getActiveConversation();
      if (convId) socket.emit('join:conversation', { conversationId: convId });
      if (isReconnect) {
        for (const fn of reconnectListeners) {
          try { fn(); } catch { /* Isola assinantes. */ }
        }
      }
    };
    if (subscribers++ === 0) unsubscribeReady = subscribeSocketReady(handleReady);
    handleReady(getSocketAuthReady(), false);
    return () => {
      if (--subscribers === 0) {
        unsubscribeReady?.();
        unsubscribeReady = undefined;
      }
    };
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  const emit = useCallback((event: string, data: any) => {
    const socket = socketRef.current;
    if (!socket) return;
    // Track join/leave to support auto-rejoin across reconnects.
    if (event === 'join:conversation') {
      setActiveConversation(data?.conversationId ?? null);
      // Defer the actual emit until backend signals `ready`. Without this,
      // a fresh tab opens the inbox, mounts ChatPanel, fires this emit
      // BEFORE handleConnection finishes the DB lookup, and the join is
      // silently dropped — leaving the user with stale chat panel.
      if (!getSocketAuthReady()) return;
    }
    if (event === 'leave:conversation') {
      if (getActiveConversation() === data?.conversationId) {
        setActiveConversation(null);
      }
    }
    socket.emit(event, data);
  }, []);

  /**
   * Subscribe to "we just came back from a disconnect" — fires after
   * every `ready` except the very first one. Use it to refetch any data
   * that could have changed while we were offline (messages, conversation
   * list). Returns an unsubscribe function for cleanup in useEffect.
   */
  const onReconnect = useCallback((handler: () => void) => {
    reconnectListeners.add(handler);
    return () => {
      reconnectListeners.delete(handler);
    };
  }, []);

  return { on, emit, onReconnect, socket: socketRef };
}
