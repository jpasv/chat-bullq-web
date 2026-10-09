import { api } from '@/lib/api';

export type SocialCommentStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';

export interface SocialComment {
  id: string;
  channelId: string;
  externalId: string;
  parentExternalId: string | null;
  mediaId: string;
  mediaPermalink: string | null;
  mediaCaption: string | null;
  mediaThumbnailUrl: string | null;
  authorExternalId: string;
  authorUsername: string | null;
  text: string;
  status: SocialCommentStatus;
  isFromPage: boolean;
  repliedAt: string | null;
  privateReplyConversationId: string | null;
  commentedAt: string;
  replies: SocialComment[];
}

export interface CommentsFilters {
  channelId?: string;
  mediaId?: string;
  status?: SocialCommentStatus;
  unreplied?: boolean;
}

export interface CommentsPage {
  items: SocialComment[];
  nextCursor: string | null;
}

/** Um post do Instagram com o resumo dos comentários dele. */
export interface SocialMediaSummary {
  channelId: string;
  mediaId: string;
  mediaPermalink: string | null;
  mediaCaption: string | null;
  mediaThumbnailUrl: string | null;
  total: number;
  unreplied: number;
  lastCommentAt: string;
}

export const commentsService = {
  async list(filters: CommentsFilters, cursor?: string): Promise<CommentsPage> {
    // Por post o volume é pequeno: busca e ordenação ficam no cliente.
    const params: Record<string, string> = { limit: filters.mediaId ? '200' : '30' };
    if (filters.channelId) params.channelId = filters.channelId;
    if (filters.mediaId) params.mediaId = filters.mediaId;
    if (filters.status) params.status = filters.status;
    if (filters.unreplied) params.unreplied = 'true';
    if (cursor) params.cursor = cursor;
    const { data } = await api.get('/social-comments', { params });
    return data.data;
  },
  async listMedia(channelId?: string): Promise<SocialMediaSummary[]> {
    const params: Record<string, string> = {};
    if (channelId) params.channelId = channelId;
    const { data } = await api.get('/social-comments/media', { params });
    return data.data;
  },
  async reply(id: string, text: string): Promise<SocialComment> {
    const { data } = await api.post(`/social-comments/${id}/reply`, { text });
    return data.data;
  },
  async hide(id: string, hidden: boolean): Promise<SocialComment> {
    const { data } = await api.patch(`/social-comments/${id}/hide`, { hidden });
    return data.data;
  },
  async remove(id: string): Promise<SocialComment> {
    const { data } = await api.delete(`/social-comments/${id}`);
    return data.data;
  },
  async privateReply(id: string, text: string): Promise<{ conversationId: string }> {
    const { data } = await api.post(`/social-comments/${id}/private-reply`, { text });
    return data.data;
  },
  async suggest(id: string): Promise<{ text: string; reason?: 'spam' }> {
    const { data } = await api.post(`/social-comments/${id}/suggest`);
    return data.data;
  },
};
