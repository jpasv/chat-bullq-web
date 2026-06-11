import { api } from '@/lib/api';

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface TagLink {
  tag: TagRef;
}

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  tags?: TagLink[];
}

export interface ChannelInfo {
  id: string;
  type: string;
  name: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface LastMessage {
  id: string;
  type: string;
  content: Record<string, any>;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string;
}

export interface Conversation {
  id: string;
  organizationId: string;
  channelId: string;
  contactId: string;
  assignedToId: string | null;
  status: string;
  protocol: string | null;
  subject?: string | null;
  isGroup: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  aiEnabled?: boolean | null;
  aiDisabledBy?: string | null;
  aiDisabledAt?: string | null;
  activeAgentId?: string | null;
  contact: Contact;
  channel: ChannelInfo;
  assignedTo: AgentInfo | null;
  messages: LastMessage[];
  tags?: TagLink[];
  _count: { messages: number };
  /** Inbound messages newer than the current user's lastReadAt cursor. */
  unreadCount?: number;
}

export interface MessageSender {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface StoryReplyContext {
  id?: string;
  url?: string;
  kind?: 'reply' | 'mention';
}

export interface ReplyContext {
  externalMessageId?: string;
  story?: StoryReplyContext;
  ad?: { id?: string; title?: string };
  /** ID interno da Message original — preenchido quando a reply foi
   *  criada pela nossa UI (botão "Responder"). Usado pelo MessageBubble
   *  pra fazer scroll/highlight da msg original ao clicar no quote. */
  messageId?: string;
  /** Trecho da msg original (até ~120 chars) — UI mostra como preview. */
  previewText?: string;
  /** Nome de quem enviou a msg original — UI mostra acima do preview. */
  senderName?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
  provider: string;
  transcribedAt: string;
}

export interface MessageMetadata {
  isEcho?: boolean;
  replyTo?: ReplyContext | null;
  transcription?: TranscriptionResult | null;
  rawPayload?: any;
  [key: string]: any;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  content: Record<string, any>;
  externalId: string | null;
  status: string;
  /** Motivo do erro quando status=FAILED. Vem direto do provider WhatsApp.
   *  Ex.: "Re-engagement message" = janela 24h expirada → precisa template. */
  failedReason?: string | null;
  senderName: string | null;
  senderId: string | null;
  sender: MessageSender | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  metadata?: MessageMetadata | null;
  /** Quando setado, mensagem foi deletada pra todos. UI renderiza placeholder. */
  revokedAt?: string | null;
  revokedBy?: string | null;
  /** true = provider confirmou delete (cliente final viu sumir).
   *  false = só sumiu no nosso lado (provider não suportou). */
  revokeSucceededRemote?: boolean | null;
}

export interface PaginatedResponse<T> {
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const inboxService = {
  async getConversations(params?: Record<string, string>): Promise<{
    conversations: Conversation[];
    pagination: any;
  }> {
    const { data } = await api.get('/conversations', { params });
    return data.data;
  },

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await api.get(`/conversations/${id}`);
    return data.data;
  },

  async getMessages(conversationId: string, page = 1, limit = 50): Promise<{
    messages: Message[];
    pagination: any;
  }> {
    const { data } = await api.get('/messages', {
      params: { conversationId, page, limit },
    });
    return data.data;
  },

  async sendMessage(payload: {
    conversationId: string;
    type: string;
    content: Record<string, any>;
    /** ID interno da Message respondida — backend resolve externalId. */
    replyToMessageId?: string;
  }): Promise<Message> {
    const { data } = await api.post('/messages', payload);
    return data.data;
  },

  /**
   * Deleta mensagem pra todos. Tenta propagar pro provider. Resposta indica
   * se o provider aceitou (cliente final viu sumir) ou se foi só local.
   */
  async revokeMessage(messageId: string): Promise<{
    messageId: string;
    revokedAt: string;
    revokedBy: string;
    succeededRemote: boolean;
    remoteError: string | null;
  }> {
    const { data } = await api.delete(`/messages/${messageId}`);
    return data.data ?? data;
  },

  async assignToMe(conversationId: string): Promise<Conversation> {
    const { data } = await api.post(`/conversations/${conversationId}/assign-me`);
    return data.data;
  },

  /**
   * Atribui (ou desatribui com null) a conversa pra um user da org.
   * Usa o endpoint genérico de update que aceita assignedToId.
   */
  async assignTo(
    conversationId: string,
    assignedToId: string | null,
  ): Promise<Conversation> {
    const { data } = await api.patch(`/conversations/${conversationId}`, {
      assignedToId,
    });
    return data.data;
  },

  async closeConversation(conversationId: string): Promise<Conversation> {
    const { data } = await api.post(`/conversations/${conversationId}/close`);
    return data.data;
  },

  async markAsRead(
    conversationId: string,
    lastReadMessageId?: string,
  ): Promise<{ ok: boolean; lastReadAt: string }> {
    const { data } = await api.post(`/conversations/${conversationId}/read`, {
      lastReadMessageId,
    });
    return data.data ?? data;
  },

  async markAsUnread(
    conversationId: string,
  ): Promise<{ ok: boolean; unreadCount: number }> {
    const { data } = await api.post(`/conversations/${conversationId}/unread`);
    return data.data ?? data;
  },

  async reopenConversation(conversationId: string): Promise<Conversation> {
    const { data } = await api.post(`/conversations/${conversationId}/reopen`);
    return data.data;
  },

  async syncConversation(
    conversationId: string,
  ): Promise<{ imported: number; fetched: number; syncedAt: string }> {
    const { data } = await api.post(`/conversations/${conversationId}/sync`, {});
    return data.data;
  },

  async toggleAi(
    conversationId: string,
    enabled: boolean | null,
  ): Promise<Conversation> {
    const { data } = await api.patch(`/conversations/${conversationId}/ai`, {
      enabled,
    });
    return data.data ?? data;
  },

  async engageAi(
    conversationId: string,
  ): Promise<{ engaged: boolean; reason?: string }> {
    const { data } = await api.post(
      `/conversations/${conversationId}/ai/engage`,
    );
    return data.data ?? data;
  },

  async setActiveAgent(
    conversationId: string,
    agentId: string,
  ): Promise<{ engaged: boolean; reason?: string; agentName?: string }> {
    const { data } = await api.post(
      `/conversations/${conversationId}/ai/set-agent`,
      { agentId },
    );
    return data.data ?? data;
  },

  async getStatusCounts(): Promise<Record<string, number>> {
    const { data } = await api.get('/conversations/counts');
    return data.data;
  },

  async bulkClose(ids: string[]): Promise<void> {
    await Promise.allSettled(ids.map((id) => api.post(`/conversations/${id}/close`)));
  },

  async bulkAssignToMe(ids: string[]): Promise<void> {
    await Promise.allSettled(ids.map((id) => api.post(`/conversations/${id}/assign-me`)));
  },

  async bulkReopen(ids: string[]): Promise<void> {
    await Promise.allSettled(ids.map((id) => api.post(`/conversations/${id}/reopen`)));
  },

  async bulkSetAi(ids: string[], enabled: boolean | null): Promise<void> {
    await Promise.allSettled(
      ids.map((id) => api.patch(`/conversations/${id}/ai`, { enabled })),
    );
  },

  async bulkEngageAi(ids: string[]): Promise<void> {
    await Promise.allSettled(
      ids.map((id) => api.post(`/conversations/${id}/ai/engage`)),
    );
  },

  async updateConversation(
    conversationId: string,
    patch: { subject?: string | null },
  ): Promise<Conversation> {
    const { data } = await api.patch(`/conversations/${conversationId}`, patch);
    return data.data ?? data;
  },

  async renameContact(contactId: string, name: string): Promise<void> {
    await api.patch(`/contacts/${contactId}`, { name });
  },

  async archive(conversationId: string): Promise<Conversation> {
    const { data } = await api.post(`/conversations/${conversationId}/archive`);
    return data.data;
  },

  async unarchive(conversationId: string): Promise<Conversation> {
    const { data } = await api.post(`/conversations/${conversationId}/unarchive`);
    return data.data;
  },

  async resolveMediaUrl(messageId: string): Promise<{ url: string; mimeType?: string }> {
    const { data } = await api.get(`/messages/${messageId}/media`);
    return data.data;
  },

  async transcribeAudio(messageId: string, force = false): Promise<TranscriptionResult> {
    // NOTE: body must be {} (not null) — express.json({ strict: true }) rejects
    // literal "null" with "Unexpected token 'n', \"null\" is not valid JSON".
    const { data } = await api.post(`/messages/${messageId}/transcribe`, {}, {
      params: force ? { force: 'true' } : undefined,
    });
    return data.data;
  },

  async uploadAudio(blob: Blob, filename = 'audio.webm'): Promise<{
    url: string;
    mimeType: string;
    size: number;
  }> {
    const form = new FormData();
    form.append('file', blob, filename);
    const { data } = await api.post('/messages/uploads/audio', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data;
  },

  async sendAudioMessage(conversationId: string, blob: Blob): Promise<Message> {
    const upload = await this.uploadAudio(blob);
    return this.sendMessage({
      conversationId,
      type: 'AUDIO',
      content: {
        mediaUrl: upload.url,
        mimeType: upload.mimeType,
        fileSize: upload.size,
      },
    });
  },

  async uploadMedia(file: File): Promise<{
    url: string;
    mimeType: string;
    size: number;
    filename: string;
  }> {
    const form = new FormData();
    form.append('file', file, file.name);
    const { data } = await api.post('/messages/uploads/media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Upload de arquivo grande estoura o timeout default de 15s do client.
      timeout: 120000,
    });
    return data.data;
  },

  /**
   * Anexo do chat (clipe de papel): sobe o arquivo e envia como
   * IMAGE/VIDEO/DOCUMENT conforme o mime. Áudio gravado no app NÃO passa
   * por aqui (sendAudioMessage transcoda pra voice note).
   */
  async sendMediaMessage(
    conversationId: string,
    file: File,
    caption?: string,
  ): Promise<Message> {
    const upload = await this.uploadMedia(file);
    const mime = upload.mimeType || file.type || '';
    const type = mime.startsWith('image/')
      ? 'IMAGE'
      : mime.startsWith('video/')
        ? 'VIDEO'
        : 'DOCUMENT';
    return this.sendMessage({
      conversationId,
      type,
      content: {
        mediaUrl: upload.url,
        mimeType: mime,
        fileSize: upload.size,
        fileName: upload.filename || file.name,
        ...(caption ? { caption } : {}),
      },
    });
  },
};
