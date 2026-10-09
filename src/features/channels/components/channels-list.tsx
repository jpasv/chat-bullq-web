'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio } from 'lucide-react';
import { channelsService } from '../services/channels.service';
import { ChannelCard } from './channel-card';
import { CreateChannelDialog } from './create-channel-dialog';
import { useOrgId } from '@/hooks/use-org-query-key';

export function ChannelsList() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  const { data: channels, isLoading, isError, refetch } = useQuery({
    queryKey: ['channels', orgId],
    queryFn: () => channelsService.list(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['channels'] });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Canais Conectados
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Gerencie seus canais de atendimento
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo Canal
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
          ))
        ) : isError ? (
          <div role="alert" className="col-span-full p-6 text-center text-sm text-zinc-500">
            <p>Não foi possível carregar canais.</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 text-primary hover:underline">
              Tentar novamente
            </button>
          </div>
        ) : channels && channels.length > 0 ? (
          channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} onUpdate={refresh} />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-800">
            <Radio className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Nenhum canal configurado
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Conecte seu primeiro canal para começar a receber mensagens
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Conectar Canal
            </button>
          </div>
        )}
      </div>

      <CreateChannelDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refresh}
      />
    </div>
  );
}
