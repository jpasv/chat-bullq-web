 'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { channelsService } from '@/features/channels/services/channels.service';
import { templateContent, templateVarCount, templateUnsupportedReason } from '../services/template-utils';

export function ConversationTemplatePicker({ channelId, onSend, disabled }: { channelId: string; onSend: (content: Record<string, unknown>) => Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const { data: templates = [], isLoading, isError } = useQuery({ queryKey: ['channel-templates', channelId], queryFn: () => channelsService.getTemplates(channelId), enabled: open });
  const template = templates.find(t => `${t.name}:${t.language}` === selected);
  const unsupportedReason = template ? templateUnsupportedReason(template) : null;
  return <div className="mb-2 text-sm">
    <button type="button" disabled={disabled || sending} className="text-primary disabled:opacity-50" onClick={() => setOpen(!open)}>Enviar template aprovado</button>
    {open && <div className="mt-2 space-y-2 rounded border p-3">
      {isLoading && <p>Carregando templates…</p>}{isError && <p role="alert">Não foi possível carregar templates.</p>}
      <select aria-label="Template aprovado" className="w-full rounded border bg-background p-2" value={selected} onChange={e => { setSelected(e.target.value); const t = templates.find(t => `${t.name}:${t.language}` === e.target.value); setValues(Array(templateVarCount(t)).fill('')); }}>
        <option value="">Selecione um template</option>{templates.map(t => { const reason = templateUnsupportedReason(t); return <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`} disabled={!!reason}>{t.name} ({t.language}){reason ? ` — ${reason}` : ''}</option>; })}
      </select>
      {!isLoading && !isError && templates.length === 0 && <p>Nenhum template aprovado disponível.</p>}
      {unsupportedReason && <p role="alert">{unsupportedReason}</p>}
      {template && <p className="whitespace-pre-wrap text-xs text-zinc-500">{template.components.find(c => c.type === 'BODY')?.text}</p>}
      {values.map((v, i) => <label key={i} className="block">Variável {i + 1}<input className="ml-2 rounded border bg-transparent p-1" value={v} onChange={e => setValues(old => old.map((x, j) => i === j ? e.target.value : x))} /></label>)}
      <button type="button" className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={disabled || sending || !template || !!unsupportedReason || values.some(v => !v.trim())} onClick={async () => {
        if (!template || unsupportedReason) return; setSending(true);
        try { await onSend(templateContent(template, values)); setOpen(false); setSelected(''); setValues([]); }
        catch { toast.error('Não foi possível enviar o template'); } finally { setSending(false); }
      }}>{sending ? 'Enviando…' : 'Enviar template'}</button>
    </div>}
  </div>;
}
