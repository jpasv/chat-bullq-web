'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxService, type Conversation } from '../services/inbox.service';
import {
  channelsService,
  type Channel,
  type WhatsAppTemplate,
} from '@/features/channels/services/channels.service';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon, MembersIcon } from '@/components/ui/icons';

const channelIcons: Record<string, React.ElementType> = {
  WHATSAPP_ZAPPFY: ZappfyIcon,
  WHATSAPP_OFFICIAL: MetaIcon,
  INSTAGRAM: InstagramIcon,
  GMAIL: GmailIcon,
  MEMBERS: MembersIcon,
};

const channelLabels: Record<string, string> = {
  WHATSAPP_ZAPPFY: 'WhatsApp',
  WHATSAPP_OFFICIAL: 'WhatsApp Oficial',
  INSTAGRAM: 'Instagram',
  GMAIL: 'Gmail',
  MEMBERS: 'Área de membros',
};

/** Conta placeholders {{1}}, {{2}}... no texto do componente BODY do template. */
function templateVarCount(template: WhatsAppTemplate | undefined): number {
  const body = template?.components.find((c) => c.type === 'BODY');
  const matches = (body?.text as string | undefined)?.match(/\{\{\d+\}\}/g);
  return matches?.length ?? 0;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Conversa criada/reaproveitada — chamado pra abrir ela na inbox. */
  onCreated: (conversation: Conversation) => void;
}

export function NewConversationDialog({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [channelId, setChannelId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: channelsService.list,
    enabled: open,
  });

  const selectedChannel = useMemo(
    () => channels?.find((c) => c.id === channelId),
    [channels, channelId],
  );
  const channelType = selectedChannel?.type;

  const { data: templates } = useQuery({
    queryKey: ['channel-templates', channelId],
    queryFn: () => channelsService.getTemplates(channelId),
    enabled: open && channelType === 'WHATSAPP_OFFICIAL' && !!channelId,
  });

  const selectedTemplate = templates?.find((t) => t.name === templateName);
  const varCount = templateVarCount(selectedTemplate);

  // Reset ao abrir/trocar de canal — evita levar lixo de uma tentativa anterior.
  useEffect(() => {
    if (open) {
      setChannelId('');
      setPhone('');
      setEmail('');
      setName('');
      setSubject('');
      setMessageText('');
      setTemplateName('');
      setTemplateVars([]);
    }
  }, [open]);

  useEffect(() => {
    setTemplateName('');
    setTemplateVars([]);
  }, [channelId]);

  useEffect(() => {
    setTemplateVars(Array(varCount).fill(''));
  }, [templateName, varCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, sending]);

  if (!open) return null;

  const isGmail = channelType === 'GMAIL';
  const isOfficial = channelType === 'WHATSAPP_OFFICIAL';
  const isZappfy = channelType === 'WHATSAPP_ZAPPFY';

  const contactValid = isGmail ? email.trim().length > 3 : phone.trim().length >= 8;
  const messageValid = isOfficial
    ? !!templateName && templateVars.every((v) => v.trim().length > 0)
    : messageText.trim().length > 0;
  const canSubmit = !!channelId && contactValid && messageValid && !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const message = isOfficial
        ? {
            type: 'TEMPLATE' as const,
            content: {
              name: templateName,
              language: { code: selectedTemplate?.language ?? 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: templateVars.map((v) => ({
                    type: 'text',
                    text: v.trim() || '-',
                  })),
                },
              ],
            },
          }
        : { type: 'TEXT' as const, content: { text: messageText.trim() } };

      const sentMessage = await inboxService.startConversation({
        channelId,
        contact: {
          phone: isGmail ? undefined : phone.trim(),
          email: isGmail ? email.trim() : undefined,
          name: name.trim() || undefined,
        },
        message,
        subject: isGmail ? subject.trim() || undefined : undefined,
      });

      const conversation = await inboxService.getConversation(
        sentMessage.conversationId,
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa iniciada');
      onCreated(conversation);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Erro ao iniciar conversa',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !sending && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Nova conversa
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              Canal
            </label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={sending}
              className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Selecione um canal</option>
              {/* MEMBERS: a conversa nasce na área de membros (handoff do bot);
                  a API recusa iniciar por aqui. */}
              {channels?.filter((c: Channel) => c.type !== 'MEMBERS').map((c: Channel) => (
                <option key={c.id} value={c.id} disabled={c.type === 'INSTAGRAM'}>
                  {channelLabels[c.type] ?? c.type} — {c.name}
                  {c.type === 'INSTAGRAM' ? ' (indisponível)' : ''}
                </option>
              ))}
            </select>
            {channelType === 'INSTAGRAM' && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
                Instagram não suporta iniciar conversa — a Meta só permite
                responder depois que o cliente manda a primeira mensagem.
              </p>
            )}
          </div>

          {channelId && channelType !== 'INSTAGRAM' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className={isGmail ? 'col-span-2' : ''}>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    {isGmail ? 'Email' : 'Telefone'}
                  </label>
                  <input
                    type="text"
                    value={isGmail ? email : phone}
                    onChange={(e) =>
                      isGmail ? setEmail(e.target.value) : setPhone(e.target.value)
                    }
                    disabled={sending}
                    placeholder={isGmail ? 'cliente@exemplo.com' : '5511999999999'}
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    autoFocus
                  />
                </div>
                {!isGmail && (
                  <div>
                    <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                      Nome (opcional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={sending}
                      className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                )}
              </div>

              {isGmail && (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Nome (opcional)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={sending}
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              {isGmail && (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Assunto (opcional)
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sending}
                    placeholder="Sem assunto = usa a 1ª linha da mensagem"
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              {isOfficial ? (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Template aprovado
                  </label>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Fora da janela de 24h, a Meta exige um template HSM
                    aprovado — não dá pra mandar texto livre.
                  </p>
                  <select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    disabled={sending}
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">
                      {templates ? 'Selecione um template' : 'Carregando templates...'}
                    </option>
                    {templates?.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                  {templates && templates.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
                      Nenhum template aprovado encontrado pra esse canal.
                    </p>
                  )}
                  {templateVars.map((v, i) => (
                    <input
                      key={i}
                      type="text"
                      value={v}
                      onChange={(e) => {
                        const next = [...templateVars];
                        next[i] = e.target.value;
                        setTemplateVars(next);
                      }}
                      disabled={sending}
                      placeholder={`Variável {{${i + 1}}}`}
                      className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Mensagem
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    disabled={sending}
                    rows={4}
                    placeholder="Escreva a primeira mensagem..."
                    className="mt-1.5 w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              {isZappfy && (
                <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Contato frio em volume alto pode fazer o número levar
                  bloqueio no WhatsApp — use com moderação.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 className="h-3 w-3 animate-spin" />}
            Iniciar conversa
          </button>
        </div>
      </div>
    </div>
  );
}
