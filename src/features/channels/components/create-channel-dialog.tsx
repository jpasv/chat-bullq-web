'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, X, Copy, Check, KeyRound, AlertTriangle } from 'lucide-react';
import { channelsService, type Channel, type ChannelType } from '../services/channels.service';
import { ZappfyIcon, MetaIcon, InstagramIcon, GmailIcon, MembersIcon } from '@/components/ui/icons';

const channelTypes: { value: ChannelType; label: string; icon: React.ElementType; color: string; description: string }[] = [
  {
    value: 'WHATSAPP_ZAPPFY',
    label: 'WhatsApp (Zappfy)',
    icon: ZappfyIcon,
    color: 'bg-zinc-50 dark:bg-zinc-800',
    description: 'Conecte via Zappfy/Uazapi — sem restrição de 24h',
  },
  {
    value: 'WHATSAPP_OFFICIAL',
    label: 'WhatsApp Official',
    icon: MetaIcon,
    color: 'bg-zinc-50 dark:bg-zinc-800',
    description: 'Meta Cloud API — templates HSM, alta escala',
  },
  {
    value: 'INSTAGRAM',
    label: 'Instagram',
    icon: InstagramIcon,
    color: 'bg-zinc-50 dark:bg-zinc-800',
    description: 'Instagram API com login empresarial — DMs e stories',
  },
  {
    value: 'GMAIL',
    label: 'Gmail',
    icon: GmailIcon,
    color: 'bg-zinc-50 dark:bg-zinc-800',
    description: 'Emails da caixa Google viram conversas — via polling',
  },
  {
    value: 'MEMBERS',
    label: 'Área de membros',
    icon: MembersIcon,
    color: 'bg-zinc-50 dark:bg-zinc-800',
    description: 'Suporte da área de membros — recebe os handoffs do bot',
  },
];

const zappfySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  token: z.string().min(1, 'Token é obrigatório'),
  webhookSecret: z.string().optional(),
});

const waOfficialSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  phoneNumberId: z.string().min(1, 'Phone Number ID é obrigatório'),
  accessToken: z.string().min(1, 'Access Token é obrigatório'),
  appSecret: z.string().min(1, 'App Secret é obrigatório (valida assinatura dos webhooks)'),
  businessAccountId: z.string().optional(),
  webhookSecret: z.string().optional(),
});

const instagramSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  accessToken: z.string().min(1, 'Access Token é obrigatório'),
  appSecret: z.string().min(1, 'App Secret é obrigatório'),
  igBusinessId: z.string().optional(),
  igAppId: z.string().optional(),
  webhookSecret: z.string().optional(),
});

const gmailSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  refreshToken: z.string().min(1, 'Refresh Token é obrigatório'),
  draftMode: z.boolean().optional(),
});

const membersSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  callbackUrl: z
    .string()
    .trim()
    .min(1, 'URL de callback é obrigatória')
    .refine((v) => /^https?:\/\/\S+$/i.test(v), 'URL inválida (use uma URL http/https completa)'),
  callbackSecret: z.string().trim().min(16, 'Segredo muito curto (mínimo 16 caracteres) — use "Gerar"'),
});

type ZappfyFormData = z.infer<typeof zappfySchema>;
type WaOfficialFormData = z.infer<typeof waOfficialSchema>;
type InstagramFormData = z.infer<typeof instagramSchema>;
type GmailFormData = z.infer<typeof gmailSchema>;
type MembersFormData = z.infer<typeof membersSchema>;

/** 32 bytes aleatórios em hex (64 chars) — mesmo formato do webhookSecret gerado pela API. */
function generateSecretHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const inputCls = 'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
const labelCls = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';
const errorCls = 'text-xs text-red-500';

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateChannelDialog({ open, onClose, onCreated }: CreateChannelDialogProps) {
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [selectedType, setSelectedType] = useState<ChannelType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // MEMBERS: depois de criar, mostra as variáveis que o members-backend precisa
  // (os segredos só aparecem completos aqui e no "Revelar segredos" da edição).
  const [membersResult, setMembersResult] = useState<{ channel: Channel; callbackSecret: string } | null>(null);
  // Default ORG = qualquer membro com permissão padrão enxerga.
  // PRIVATE = apenas quem tiver grant explícito (pra canais sensíveis).
  const [visibility, setVisibility] = useState<'ORG' | 'PRIVATE'>('ORG');

  const zappfyForm = useForm<ZappfyFormData>({
    resolver: zodResolver(zappfySchema),
    defaultValues: { name: '', token: '', webhookSecret: '' },
  });

  const waForm = useForm<WaOfficialFormData>({
    resolver: zodResolver(waOfficialSchema),
    defaultValues: { name: '', phoneNumberId: '', accessToken: '', appSecret: '', businessAccountId: '', webhookSecret: '' },
  });

  const igForm = useForm<InstagramFormData>({
    resolver: zodResolver(instagramSchema),
    defaultValues: { name: '', accessToken: '', appSecret: '', igBusinessId: '', igAppId: '', webhookSecret: '' },
  });

  const gmailForm = useForm<GmailFormData>({
    resolver: zodResolver(gmailSchema),
    defaultValues: { name: '', email: '', refreshToken: '', draftMode: false },
  });

  const membersForm = useForm<MembersFormData>({
    resolver: zodResolver(membersSchema),
    defaultValues: { name: 'Área de membros', callbackUrl: '', callbackSecret: '' },
  });

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  const handleTypeSelect = (type: ChannelType) => {
    setSelectedType(type);
    setStep('config');
  };

  const handleCopyWebhook = (channelType: string) => {
    navigator.clipboard.writeText(`${apiBaseUrl}/webhooks/${channelType}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitChannel = async (type: ChannelType, name: string, config: Record<string, any>, webhookSecret?: string) => {
    setIsLoading(true);
    try {
      await channelsService.create({ type, name, config, webhookSecret, visibility });
      toast.success('Canal criado com sucesso!');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitMembers = async (data: MembersFormData) => {
    setIsLoading(true);
    try {
      const callbackSecret = data.callbackSecret.trim();
      // webhookSecret omitido: a API gera 32 bytes hex e devolve sem máscara na criação.
      const channel = await channelsService.create({
        type: 'MEMBERS',
        name: data.name,
        config: { callbackUrl: data.callbackUrl.trim(), callbackSecret },
        visibility,
      });
      toast.success('Canal criado com sucesso!');
      setMembersResult({ channel, callbackSecret });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitZappfy =(data: ZappfyFormData) =>
    submitChannel('WHATSAPP_ZAPPFY', data.name, { token: data.token }, data.webhookSecret);

  const onSubmitWaOfficial = (data: WaOfficialFormData) =>
    submitChannel(
      'WHATSAPP_OFFICIAL',
      data.name,
      {
        phoneNumberId: data.phoneNumberId,
        accessToken: data.accessToken,
        appSecret: data.appSecret,
        businessAccountId: data.businessAccountId || undefined,
      },
      data.webhookSecret,
    );

  const onSubmitInstagram = (data: InstagramFormData) =>
    submitChannel(
      'INSTAGRAM',
      data.name,
      {
        accessToken: data.accessToken,
        appSecret: data.appSecret,
        igBusinessId: data.igBusinessId || undefined,
        igAppId: data.igAppId || undefined,
        apiVersion: 'v21.0',
      },
      data.webhookSecret,
    );

  const onSubmitGmail = (data: GmailFormData) =>
    submitChannel('GMAIL', data.name, {
      email: data.email,
      refreshToken: data.refreshToken,
      sendMode: data.draftMode ? 'draft' : 'send',
    });

  const handleClose = () => {
    setStep('type');
    setSelectedType(null);
    zappfyForm.reset();
    waForm.reset();
    igForm.reset();
    gmailForm.reset();
    membersForm.reset();
    setMembersResult(null);
    onClose();
  };

  if (!open) return null;

  const titleMap: Record<string, string> = {
    WHATSAPP_ZAPPFY: 'Configurar Zappfy',
    WHATSAPP_OFFICIAL: 'Configurar WhatsApp Official',
    INSTAGRAM: 'Configurar Instagram',
    GMAIL: 'Configurar Gmail',
    MEMBERS: 'Configurar Área de membros',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={membersResult ? undefined : handleClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {membersResult ? 'Canal criado' : step === 'type' ? 'Novo Canal' : titleMap[selectedType || '']}
          </h2>
          <button onClick={handleClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {membersResult ? (
          <MembersEnvPanel
            channel={membersResult.channel}
            callbackSecret={membersResult.callbackSecret}
            apiBaseUrl={apiBaseUrl}
            onDone={handleClose}
          />
        ) : step === 'type' ? (
          <div className="mt-6 grid gap-3">
            {channelTypes.map((ct) => (
              <button
                key={ct.value}
                onClick={() => handleTypeSelect(ct.value)}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 text-left transition-all hover:border-primary hover:shadow-sm dark:border-zinc-700 dark:hover:border-primary"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 ${ct.color}`}>
                  <ct.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{ct.label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{ct.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : selectedType === 'WHATSAPP_ZAPPFY' ? (
          <form onSubmit={zappfyForm.handleSubmit(onSubmitZappfy)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: WhatsApp Principal" error={zappfyForm.formState.errors.name?.message} {...zappfyForm.register('name')} />
            <Field label="Token" placeholder="Token da instância Zappfy" error={zappfyForm.formState.errors.token?.message} {...zappfyForm.register('token')} />
            <Field label="Webhook Secret" placeholder="Opcional" optional {...zappfyForm.register('webhookSecret')} />
            <WebhookUrl url={`${apiBaseUrl}/webhooks/WHATSAPP_ZAPPFY`} copied={copied} onCopy={() => handleCopyWebhook('WHATSAPP_ZAPPFY')} />
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'WHATSAPP_OFFICIAL' ? (
          <form onSubmit={waForm.handleSubmit(onSubmitWaOfficial)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: WhatsApp Business" error={waForm.formState.errors.name?.message} {...waForm.register('name')} />
            <Field label="Phone Number ID" placeholder="Encontrado no Meta Business Suite" error={waForm.formState.errors.phoneNumberId?.message} {...waForm.register('phoneNumberId')} />
            <Field label="Access Token" type="text" placeholder="System User Token ou Temporary Token" error={waForm.formState.errors.accessToken?.message} {...waForm.register('accessToken')} />
            <Field label="App Secret" type="text" placeholder="Chave secreta do app (Settings → Basic na Meta)" error={waForm.formState.errors.appSecret?.message} {...waForm.register('appSecret')} />
            <Field label="Business Account ID (WABA)" placeholder="Opcional — habilita auto-subscribe do webhook" optional {...waForm.register('businessAccountId')} />
            <Field label="Webhook Verify Token" placeholder="Token que você definiu no Meta" optional {...waForm.register('webhookSecret')} />
            <WebhookUrl url={`${apiBaseUrl}/webhooks/WHATSAPP_OFFICIAL`} copied={copied} onCopy={() => handleCopyWebhook('WHATSAPP_OFFICIAL')} />
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'INSTAGRAM' ? (
          <form onSubmit={igForm.handleSubmit(onSubmitInstagram)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: Instagram Loja" error={igForm.formState.errors.name?.message} {...igForm.register('name')} />
            <Field label="Access Token" type="text" placeholder="Instagram User Access Token (IGAAN...)" error={igForm.formState.errors.accessToken?.message} {...igForm.register('accessToken')} />
            <Field label="App Secret" type="text" placeholder="Chave secreta do app (para validar webhooks)" error={igForm.formState.errors.appSecret?.message} {...igForm.register('appSecret')} />
            <Field label="Instagram Business ID" placeholder="Opcional — detectado automaticamente" optional {...igForm.register('igBusinessId')} />
            <Field label="Instagram App ID" placeholder="Opcional — ID do app do Instagram" optional {...igForm.register('igAppId')} />
            <Field label="Webhook Verify Token" placeholder="Token que você definiu no Meta" optional {...igForm.register('webhookSecret')} />
            <WebhookUrl url={`${apiBaseUrl}/webhooks/INSTAGRAM`} copied={copied} onCopy={() => handleCopyWebhook('INSTAGRAM')} />
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'GMAIL' ? (
          <form onSubmit={gmailForm.handleSubmit(onSubmitGmail)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: Suporte (email)" error={gmailForm.formState.errors.name?.message} {...gmailForm.register('name')} />
            <Field label="Email da caixa" placeholder="atendimento@suaempresa.com" error={gmailForm.formState.errors.email?.message} {...gmailForm.register('email')} />
            <Field label="Refresh Token" type="text" placeholder="OAuth refresh_token da caixa (1//0g...)" error={gmailForm.formState.errors.refreshToken?.message} {...gmailForm.register('refreshToken')} />
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" className="h-4 w-4 rounded border-zinc-300" {...gmailForm.register('draftMode')} />
              Modo rascunho — respostas viram drafts na caixa em vez de serem enviadas
            </label>
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
              Não precisa de webhook: os emails são buscados por polling (checagem periódica).
              O refresh_token é gerado autorizando o OAuth App da plataforma com os escopos
              gmail.readonly, gmail.send e gmail.modify.
            </div>
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : selectedType === 'MEMBERS' ? (
          <form onSubmit={membersForm.handleSubmit(onSubmitMembers)} className="mt-6 space-y-4">
            <Field label="Nome do canal" placeholder="Ex: Área de membros" error={membersForm.formState.errors.name?.message} {...membersForm.register('name')} />
            <Field
              label="URL de callback"
              placeholder="https://api.trivapp.com.br/support/bullq/webhook"
              error={membersForm.formState.errors.callbackUrl?.message}
              {...membersForm.register('callbackUrl')}
            />
            <div className="space-y-1.5">
              <label className={labelCls}>Segredo do callback</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Assina as respostas enviadas ao members-backend"
                  className={`${inputCls} font-mono`}
                  {...membersForm.register('callbackSecret')}
                />
                <button
                  type="button"
                  onClick={() =>
                    membersForm.setValue('callbackSecret', generateSecretHex(), { shouldValidate: true, shouldDirty: true })
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <KeyRound className="h-4 w-4" />
                  Gerar
                </button>
              </div>
              {membersForm.formState.errors.callbackSecret?.message && (
                <p className={errorCls}>{membersForm.formState.errors.callbackSecret.message}</p>
              )}
            </div>
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
              O members-backend envia os handoffs e mensagens para{' '}
              <code className="break-all rounded bg-zinc-100 px-1 dark:bg-zinc-800">{apiBaseUrl}/webhooks/MEMBERS</code>,
              assinados com o webhook secret gerado na criação. As respostas dos atendentes vão para a URL de
              callback, assinadas com o segredo acima. Depois de criar, você verá as variáveis de ambiente do
              members-backend.
            </div>
            <FormFooter isLoading={isLoading} onBack={() => setStep('type')} />
          </form>
        ) : null}
      </div>
    </div>
  );
}

/** Base da API sem o sufixo /api/v1 — o members-backend acrescenta o caminho. */
function stripApiPrefix(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

function MembersEnvPanel({
  channel,
  callbackSecret,
  apiBaseUrl,
  onDone,
}: {
  channel: Channel;
  callbackSecret: string;
  apiBaseUrl: string;
  onDone: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const vars: [string, string][] = [
    ['BULLQ_CHAT_API_URL', stripApiPrefix(apiBaseUrl)],
    ['BULLQ_CHANNEL_ID', channel.id],
    ['BULLQ_WEBHOOK_SECRET', channel.webhookSecret ?? ''],
    ['BULLQ_CALLBACK_SECRET', callbackSecret],
  ];
  const envText = vars.map(([k, v]) => `${k}=${v}`).join('\n');

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Canal <strong>{channel.name}</strong> criado. Configure estas variáveis de ambiente no members-backend:
      </p>
      <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Copie agora: os segredos só aparecem completos nesta tela. Depois, owners e admins podem
          revelá-los em &quot;Editar credenciais&quot; → &quot;Revelar segredos&quot;.
        </span>
      </div>
      <div className="space-y-2">
        {vars.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-2 py-1.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              title={`${k}=${v}`}
            >
              {k}={v}
            </code>
            <button
              type="button"
              onClick={() => copy(k, `${k}=${v}`)}
              aria-label={`Copiar ${k}`}
              className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
            >
              {copiedKey === k ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => copy('__all', envText)}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copiedKey === '__all' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          Copiar tudo
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

import { forwardRef } from 'react';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  optional?: boolean;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, optional, ...props }, ref) => (
    <div className="space-y-1.5">
      <label className={labelCls}>
        {label} {optional && <span className="text-zinc-400">(opcional)</span>}
      </label>
      <input ref={ref} className={inputCls} {...props} />
      {error && <p className={errorCls}>{error}</p>}
    </div>
  ),
);
Field.displayName = 'Field';

function WebhookUrl({ url, copied, onCopy }: { url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        URL do Webhook (cole no painel do provedor):
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {url}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function FormFooter({ isLoading, onBack }: { isLoading: boolean; onBack: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Voltar
      </button>
      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar Canal
      </button>
    </div>
  );
}
