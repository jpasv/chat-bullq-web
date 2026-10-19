'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MessageSquare, User } from 'lucide-react';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon, MembersIcon } from '@/components/ui/icons';
import type { CardSummary } from '../services/pipelines.service';

const channelIconByType: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  GMAIL: GmailIcon,
  MEMBERS: MembersIcon,
};

const formatBRL = (v: number | string | null) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n);
};

interface KirvanoMeta {
  event?: string;
  productName?: string | null;
  checkoutUrl?: string | null;
}

// Rótulo curto da origem do lead (evento da Kirvano) pra mostrar no card.
const KIRVANO_ORIGIN: Record<string, string> = {
  PIX_GENERATED: 'PIX',
  PIX_EXPIRED: 'PIX expirado',
  BANK_SLIP_GENERATED: 'Boleto',
  BANK_SLIP_EXPIRED: 'Boleto expirado',
  ABANDONED_CART: 'Abandono',
  SALE_REFUSED: 'Recusado',
  SALE_APPROVED: 'Pago',
  SALE_REFUNDED: 'Reembolso',
  SALE_CHARGEBACK: 'Chargeback',
};

function readKirvano(metadata: Record<string, unknown>): KirvanoMeta | null {
  const k = (metadata as { kirvano?: KirvanoMeta })?.kirvano;
  return k && typeof k === 'object' ? k : null;
}

interface Props {
  card: CardSummary;
  onClick?: () => void;
}

export function KanbanCard({ card, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: card.id,
      data: { type: 'card', card },
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const value = formatBRL(card.value);
  const contact = card.contact;
  const assignedTo = card.assignedTo;
  const isClosed = card.status !== 'OPEN';
  const kirvano = readKirvano(card.metadata);
  const origin = kirvano?.event ? KIRVANO_ORIGIN[kirvano.event] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900 ${
        isClosed
          ? 'border-zinc-200 opacity-70 dark:border-zinc-800'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-600"
          aria-label="Arrastar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {card.title}
          </p>
          {card.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
              {card.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
        {value && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {value}
          </span>
        )}
        {card.status === 'WON' && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700 dark:bg-green-900/40 dark:text-green-400">
            ganho
          </span>
        )}
        {card.status === 'LOST' && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-400">
            perdido
          </span>
        )}
        {origin && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {origin}
          </span>
        )}
      </div>

      {kirvano && (kirvano.productName || kirvano.checkoutUrl) && (
        <div className="mt-2 space-y-0.5">
          {kirvano.productName && (
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {kirvano.productName}
            </p>
          )}
          {kirvano.checkoutUrl && (
            <a
              href={kirvano.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-block text-[11px] font-medium text-primary hover:underline"
            >
              Abrir checkout →
            </a>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        {contact ? (
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{contact.name || contact.phone}</span>
          </span>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {card.conversation?.channel && (() => {
            const ChannelIcon =
              channelIconByType[card.conversation.channel.type] ?? MessageSquare;
            return (
              <span
                title={`${card.conversation.channel.name} · clique pra abrir a conversa`}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
              >
                <ChannelIcon className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
              </span>
            );
          })()}
          {!card.conversation && card.conversationId && (
            <MessageSquare
              className="h-3 w-3 text-blue-500"
              aria-label="Tem conversa vinculada"
            />
          )}
          {assignedTo && (
            <span
              title={assignedTo.name}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary"
            >
              {assignedTo.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
