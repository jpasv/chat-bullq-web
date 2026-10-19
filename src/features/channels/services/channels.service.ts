import { api } from '@/lib/api';

export type ChannelType = 'WHATSAPP_OFFICIAL' | 'WHATSAPP_ZAPPFY' | 'INSTAGRAM' | 'GMAIL' | 'MEMBERS';

export type ChannelVisibility = 'ORG' | 'PRIVATE';

export interface Channel {
  id: string;
  organizationId: string;
  type: ChannelType;
  name: string;
  config: Record<string, any>;
  webhookSecret: string | null;
  isActive: boolean;
  /** null = segue org.aiEnabled, true = força ON, false = força OFF nesse canal. */
  aiEnabled: boolean | null;
  /**
   * ORG     = qualquer membro da org com permissão padrão enxerga (default).
   * PRIVATE = só membros com grant explícito enxergam, mesmo OWNER/ADMIN.
   */
  visibility: ChannelVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelPayload {
  type: ChannelType;
  name: string;
  config: Record<string, any>;
  webhookSecret?: string;
  visibility?: ChannelVisibility;
}

export interface UpdateChannelPayload {
  name?: string;
  config?: Record<string, any>;
  webhookSecret?: string;
  isActive?: boolean;
  aiEnabled?: boolean | null;
  visibility?: ChannelVisibility;
}

/** Segredos sem máscara — `GET /channels/:id/secrets` (OWNER/ADMIN). */
export interface ChannelSecrets {
  id: string;
  type: ChannelType;
  webhookSecret: string | null;
  config: Record<string, any>;
}

export interface TestConnectionResult {
  success: boolean;
  status?: string;
  error?: string;
  data?: any;
}

export type SyncStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type SyncMode = 'INITIAL' | 'MANUAL' | 'DELTA';

export interface ChannelSyncJob {
  id: string;
  channelId: string;
  status: SyncStatus;
  mode: SyncMode;
  lookbackDays: number;
  startedAt: string | null;
  finishedAt: string | null;
  conversationsTotal: number;
  conversationsImported: number;
  messagesImported: number;
  contactsImported: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  components: Array<Record<string, any>>;
}

export const channelsService = {
  async list(): Promise<Channel[]> {
    const { data } = await api.get<{ data: Channel[] }>('/channels');
    return data.data;
  },

  async getById(id: string): Promise<Channel> {
    const { data } = await api.get<{ data: Channel }>(`/channels/${id}`);
    return data.data;
  },

  async create(payload: CreateChannelPayload): Promise<Channel> {
    const { data } = await api.post<{ data: Channel }>('/channels', payload);
    return data.data;
  },

  async update(id: string, payload: UpdateChannelPayload): Promise<Channel> {
    const { data } = await api.patch<{ data: Channel }>(`/channels/${id}`, payload);
    return data.data;
  },

  /**
   * List/detail/update devolvem webhookSecret e chaves secretas do config
   * mascarados ("********abcd"). Este endpoint devolve os valores completos.
   */
  async getSecrets(id: string): Promise<ChannelSecrets> {
    const { data } = await api.get<{ data: ChannelSecrets }>(`/channels/${id}/secrets`);
    return data.data;
  },

  async remove(id: string, confirmName: string): Promise<void> {
    await api.delete(`/channels/${id}`, {
      params: { confirmName },
    });
  },

  async testConnection(id: string): Promise<TestConnectionResult> {
    const { data } = await api.post<{ data: TestConnectionResult }>(`/channels/${id}/test`);
    return data.data;
  },

  async startSync(id: string): Promise<{ success: boolean; jobId?: string; status?: SyncStatus }> {
    const { data } = await api.post<{ data: { success: boolean; jobId?: string; status?: SyncStatus } }>(`/channels/${id}/sync`);
    return data.data;
  },

  async getSyncStatus(id: string): Promise<ChannelSyncJob | null> {
    const { data } = await api.get<{ data: { job: ChannelSyncJob | null } }>(`/channels/${id}/sync/status`);
    return data.data.job;
  },

  async cancelSync(id: string): Promise<ChannelSyncJob | null> {
    const { data } = await api.post<{ data: { job: ChannelSyncJob | null } }>(`/channels/${id}/sync/cancel`);
    return data.data.job;
  },

  /** Templates HSM aprovados — só existe para canais WHATSAPP_OFFICIAL. */
  async getTemplates(id: string): Promise<WhatsAppTemplate[]> {
    const { data } = await api.get<{ data: WhatsAppTemplate[] }>(`/channels/${id}/templates`);
    return data.data;
  },
};
