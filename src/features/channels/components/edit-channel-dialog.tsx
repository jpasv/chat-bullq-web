'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Loader2, X } from 'lucide-react';
import { channelsService, type Channel } from '../services/channels.service';
import { useAuthStore } from '@/stores/auth-store';

/** Prefixo que a API usa pra mascarar segredos em list/detail/update. */
const SECRET_MASK_PREFIX = '********';
const isMasked = (v: string | null | undefined) => !!v && v.startsWith(SECRET_MASK_PREFIX);

const MASK_HINT = 'Valor oculto — deixe como está para manter o atual, ou substitua por um novo.';

/** Base da API sem /api/v1 — formato de BULLQ_CHAT_API_URL no members-backend. */
function membersApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  return base.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

function flattenConfig(config: Record<string, any> | null | undefined): Record<string, string> {
  // Coerce nested values to string for the form. Booleans/numbers are
  // re-typed on save when needed (none of the WhatsApp configs use them).
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(config ?? {})) {
    flat[k] = v == null ? '' : String(v);
  }
  return flat;
}

interface EditChannelDialogProps {
  channel: Channel | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

/**
 * Pre-fills with the channel's current credentials so the operator can
 * audit/correct without needing to recreate. All credential inputs use
 * type="text" — JP needs the values visible to compare against the
 * provider's dashboard. This trades shoulder-surfing risk for ergonomics.
 */
export function EditChannelDialog({
  channel,
  onClose,
  onSaved,
}: EditChannelDialogProps) {
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [webhookSecret, setWebhookSecret] = useState('');
  // Valor de referência do webhookSecret (mascarado, ou o real após "Revelar")
  // — só enviamos o campo no PATCH quando o operador de fato mudou.
  const [baseWebhookSecret, setBaseWebhookSecret] = useState('');
  const [baseConfig, setBaseConfig] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const role = useAuthStore((s) => s.organizations.find((o) => o.id === s.activeOrgId)?.role);
  const canReveal = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    const flat = flattenConfig(channel.config);
    setConfig(flat);
    setBaseConfig(flat);
    setWebhookSecret(channel.webhookSecret ?? '');
    setBaseWebhookSecret(channel.webhookSecret ?? '');
    setRevealed(false);
  }, [channel]);

  if (!channel) return null;

  const fields = fieldsFor(channel.type);
  const isMembers = channel.type === 'MEMBERS';
  const hasMaskedValues =
    isMasked(baseWebhookSecret) || fields.some((f) => isMasked(baseConfig[f.key]));

  const setField = (k: string, v: string) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  const handleReveal = async () => {
    setRevealing(true);
    try {
      const secrets = await channelsService.getSecrets(channel.id);
      const flat = flattenConfig(secrets.config);
      // Só substitui campos que o operador ainda não editou.
      setConfig((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(flat)) {
          if (prev[k] === baseConfig[k]) next[k] = v;
        }
        return next;
      });
      setBaseConfig((prev) => ({ ...prev, ...flat }));
      if (webhookSecret === baseWebhookSecret) setWebhookSecret(secrets.webhookSecret ?? '');
      setBaseWebhookSecret(secrets.webhookSecret ?? '');
      setRevealed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao revelar segredos');
    } finally {
      setRevealing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      // Parte do config salvo e sobrescreve só os campos que o form expõe —
      // preserva chaves bespoke (inclusive não-string). Segredos mascarados
      // ("********…") que não foram tocados voltam como estão: a API
      // reconhece o placeholder e mantém o valor salvo.
      const merged: Record<string, any> = { ...channel.config };
      for (const f of fields) {
        const value = config[f.key] ?? '';
        // Remove empty optional keys to avoid storing literal "".
        if (f.optional && !value.trim()) {
          delete merged[f.key];
        } else {
          merged[f.key] = value;
        }
      }
      const secretChanged = webhookSecret.trim() !== baseWebhookSecret.trim();
      await channelsService.update(channel.id, {
        name: name.trim(),
        config: merged,
        webhookSecret: secretChanged && webhookSecret.trim() ? webhookSecret.trim() : undefined,
      });
      toast.success('Credenciais atualizadas');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Editar credenciais
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {channel.type.replace('_', ' ').toLowerCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Nome do canal</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls.replace(' font-mono', '')}
            />
          </div>

          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className={labelCls}>
                {f.label}{' '}
                {f.optional && <span className="text-zinc-400">(opcional)</span>}
              </label>
              <input
                type="text"
                value={config[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className={inputCls}
              />
              {f.hint && (
                <p className="text-[11px] text-zinc-500">{f.hint}</p>
              )}
              {isMasked(config[f.key]) && config[f.key] === baseConfig[f.key] && (
                <p className="text-[11px] text-zinc-500">{MASK_HINT}</p>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <label className={labelCls}>
              Webhook Secret{' '}
              {isMembers ? (
                <span className="text-zinc-400">(BULLQ_WEBHOOK_SECRET do members-backend)</span>
              ) : (
                <span className="text-zinc-400">(opcional)</span>
              )}
            </label>
            <input
              type="text"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className={inputCls}
            />
            {isMasked(webhookSecret) && webhookSecret === baseWebhookSecret && (
              <p className="text-[11px] text-zinc-500">{MASK_HINT}</p>
            )}
          </div>

          {canReveal && hasMaskedValues && !revealed && (
            <button
              type="button"
              onClick={handleReveal}
              disabled={revealing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Revelar segredos
            </button>
          )}

          {isMembers && (
            <div className="space-y-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
              <p>
                <span className="font-medium">BULLQ_CHAT_API_URL:</span>{' '}
                <code className="break-all">{membersApiUrl()}</code>
              </p>
              <p>
                <span className="font-medium">BULLQ_CHANNEL_ID:</span>{' '}
                <code className="break-all">{channel.id}</code>
              </p>
              <p>
                O segredo do callback corresponde a BULLQ_CALLBACK_SECRET no members-backend.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  optional?: boolean;
}

/** Field set per channel type — mirrors create-channel-dialog. */
function fieldsFor(type: Channel['type']): FieldDef[] {
  if (type === 'WHATSAPP_OFFICIAL') {
    return [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'Encontrado no Meta Business Suite' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'System User Token ou Temporary Token' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app (Settings → Basic na Meta)' },
      { key: 'businessAccountId', label: 'Business Account ID (WABA)', placeholder: 'Habilita auto-subscribe do webhook', optional: true },
    ];
  }
  if (type === 'WHATSAPP_ZAPPFY') {
    return [
      { key: 'token', label: 'Token', placeholder: 'Token da instância Zappfy' },
    ];
  }
  if (type === 'INSTAGRAM') {
    return [
      { key: 'accessToken', label: 'Access Token', placeholder: 'Instagram User Access Token (IGAAN...)' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'Chave secreta do app' },
      { key: 'igBusinessId', label: 'Instagram Business ID', placeholder: 'Detectado automaticamente', optional: true },
      { key: 'igAppId', label: 'Instagram App ID', optional: true },
    ];
  }
  if (type === 'MEMBERS') {
    return [
      { key: 'callbackUrl', label: 'URL de callback', placeholder: 'https://api.trivapp.com.br/support/bullq/webhook' },
      { key: 'callbackSecret', label: 'Segredo do callback', placeholder: 'Assina as respostas enviadas ao members-backend' },
    ];
  }
  if (type === 'GMAIL') {
    return [
      { key: 'email', label: 'Email da caixa', placeholder: 'atendimento@suaempresa.com' },
      { key: 'refreshToken', label: 'Refresh Token', placeholder: 'OAuth refresh_token da caixa (1//0g...)' },
      { key: 'sendMode', label: 'Modo de envio', placeholder: 'send ou draft', hint: '"send" envia direto; "draft" cria rascunho pra revisão humana', optional: true },
    ];
  }
  return [];
}
