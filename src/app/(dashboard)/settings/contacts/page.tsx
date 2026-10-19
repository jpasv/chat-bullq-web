'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Users, MessageSquare, ExternalLink } from 'lucide-react';
import { contactsService, type Contact } from '@/features/contacts/services/contacts.service';
import { useOrgId } from '@/hooks/use-org-query-key';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon, MembersIcon } from '@/components/ui/icons';

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  GMAIL: GmailIcon,
  MEMBERS: MembersIcon,
};

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const orgId = useOrgId();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', orgId, search, page],
    queryFn: () => contactsService.list({ search, page: String(page), limit: '20' }),
  });

  const contacts = data?.contacts || [];
  const pagination = data?.pagination;

  return (
    <div className="flex h-full flex-col min-h-0 min-w-0 p-6">
      <div className="mx-auto w-full max-w-5xl shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Contatos</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {pagination ? `${pagination.total} contatos` : 'Carregando...'}
            </p>
          </div>
        </div>

        <div className="mt-6 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      <div className="mx-auto mt-4 flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header fixo da tabela */}
        <table className="w-full table-fixed shrink-0">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <th className="w-[30%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Contato</th>
              <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Telefone</th>
              <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Canais</th>
              <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Tags</th>
              <th className="w-[10%] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">Conversas</th>
            </tr>
          </thead>
        </table>

        {/* Corpo scrollável */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
            </colgroup>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800">
                    <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-8 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" /></td>
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <Users className="mx-auto h-10 w-10 text-zinc-200 dark:text-zinc-700" />
                    <p className="mt-3 text-sm text-zinc-500">Nenhum contato encontrado</p>
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-zinc-50 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {(contact.name || '??').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {contact.name || 'Sem nome'}
                          </p>
                          {contact.email && (
                            <p className="truncate text-[11px] text-zinc-400">{contact.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 truncate">
                      {contact.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.channels.map((ch) => {
                          const Icon = channelIcons[ch.channel.type] || MessageSquare;
                          return (
                            <span key={ch.id} className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                              <Icon className="h-3 w-3" />
                              <span className="truncate max-w-20">{ch.channel.name}</span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((t) => (
                          <span
                            key={t.tag.id}
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white truncate max-w-20"
                            style={{ backgroundColor: t.tag.color }}
                          >
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
                      {contact._count?.conversations || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação fixa no rodapé */}
        {pagination && pagination.totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="rounded px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
