'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Film, Image as ImageIcon, Loader2, Music, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useOrgId } from '@/hooks/use-org-query-key';
import { Dialog, Label, inputCls, primaryBtn, secondaryBtn } from './dialogs';

export interface AgentMedia { id: string; name: string; kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'; url: string; mimeType: string; fileName: string; size: number; caption: string | null }

const KIND: Record<AgentMedia['kind'], { label: string; icon: React.ElementType }> = {
  IMAGE: { label: 'Imagem', icon: ImageIcon },
  VIDEO: { label: 'Vídeo', icon: Film },
  AUDIO: { label: 'Áudio', icon: Music },
  DOCUMENT: { label: 'Documento', icon: FileText },
};

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Biblioteca de mídias que os agentes enviam quando citadas no prompt com @. */
export function MediaLibraryDialog({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const mediaQ = useQuery({ queryKey: ['agent-media', orgId], queryFn: async () => { const { data } = await api.get('/ai-agents/media'); return (data.data ?? data) as AgentMedia[]; } });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['agent-media'] }); void qc.invalidateQueries({ queryKey: ['mention-options'] }); };

  const upload = async () => {
    if (!file) return toast.error('Escolha um arquivo.');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
      if (caption.trim()) form.append('caption', caption.trim());
      await api.post('/ai-agents/media', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000 });
      toast.success('Mídia enviada. Cite-a no prompt com @.');
      setFile(null); setName(''); setCaption(''); if (fileRef.current) fileRef.current.value = '';
      refresh();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível enviar o arquivo.'); }
    finally { setBusy(false); }
  };

  const remove = async (m: AgentMedia) => {
    if (!window.confirm(`Excluir "${m.name}"? Menções a ela nos prompts vão ficar em vermelho.`)) return;
    try { await api.delete(`/ai-agents/media/${m.id}`); toast.success('Mídia excluída.'); refresh(); }
    catch (err: any) { toast.error(err?.response?.data?.message ?? 'Não foi possível excluir.'); }
  };

  return (
    <Dialog title="Biblioteca de mídias" description="Vídeos, imagens, áudios e documentos que os agentes podem enviar. No prompt, cite com @, por exemplo: “se o lead pedir a lista, envie @Lista de documentos BPC”." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); void upload(); }} className="space-y-3 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
        <label className="block"><Label>Arquivo</Label>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, '')); }}
            className="block w-full text-sm text-zinc-800 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium dark:text-zinc-200 dark:file:border-zinc-600 dark:file:bg-zinc-800 dark:file:text-zinc-100" /></label>
        <label className="block"><Label>Nome para citar no prompt</Label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Vídeo explicativo BPC" maxLength={80} className={inputCls} /></label>
        <label className="block"><Label hint="opcional">Legenda padrão</Label>
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Texto enviado junto com o arquivo" className={inputCls} /></label>
        <button type="submit" disabled={busy || !file} className={primaryBtn}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar para a biblioteca</button>
      </form>

      <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
        {mediaQ.isFetching && <p role="status" className="flex items-center justify-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin" /> Carregando biblioteca…</p>}
        {mediaQ.isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar a biblioteca. <button type="button" disabled={mediaQ.isFetching} className="underline disabled:opacity-50" onClick={() => void mediaQ.refetch()}>Tentar novamente</button></p>}
        {!mediaQ.isFetching && !mediaQ.isError && mediaQ.data?.length === 0 && <p className="text-sm text-zinc-700 dark:text-zinc-300">Nenhuma mídia ainda.</p>}
        {mediaQ.data?.map(m => {
          const K = KIND[m.kind] ?? KIND.DOCUMENT;
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">
              <K.icon className="h-5 w-5 shrink-0 text-zinc-700 dark:text-zinc-300" />
              <div className="min-w-0 flex-1">
                <a href={m.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100">{m.name}</a>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{K.label}, {size(m.size)}{m.caption ? `, legenda: ${m.caption}` : ''}</p>
              </div>
              <button type="button" onClick={() => remove(m)} aria-label={`Excluir ${m.name}`} className="rounded p-1.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className={secondaryBtn}>Fechar</button></div>
    </Dialog>
  );
}
