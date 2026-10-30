import { api } from '@/lib/api';

export type IgFlowTriggerType = 'COMMENT' | 'STORY_REPLY' | 'DM_KEYWORD';

export type IgFlowRunStatus = 'RUNNING' | 'WAITING' | 'WAITING_INTERACTION' | 'DONE' | 'FAILED';

export interface IgFlowTriggerConfig {
  mediaIds?: string[];
  keywords?: string[];
  match?: 'contains' | 'exact';
  publicReplies?: string[];
  oncePerContact?: boolean;
}

export interface IgFlowButton {
  id: string;
  title: string;
  type: 'url' | 'postback';
  url?: string;
  next?: string;
}

export type IgFlowNode =
  | { id: string; type: 'message'; text: string; buttons?: IgFlowButton[]; next?: string }
  | { id: string; type: 'condition'; check: 'follows'; onTrue?: string; onFalse?: string }
  | { id: string; type: 'http'; url: string; method?: 'POST' | 'GET'; next?: string }
  | {
      id: string;
      type: 'delay';
      seconds?: number;
      until?: string;
      dailyAt?: string;
      graceMinutes?: number;
      next?: string;
    };

export interface IgFlowRunSummary {
  total: number;
  byStatus: Partial<Record<IgFlowRunStatus, number>>;
  lastRunAt: string | null;
}

export interface IgFlow {
  id: string;
  name: string;
  isActive: boolean;
  channelIds: string[];
  triggerType: IgFlowTriggerType;
  triggerConfig: IgFlowTriggerConfig;
  nodes: IgFlowNode[];
  startNodeId: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  /** Só vem na listagem. */
  stats?: IgFlowRunSummary;
}

export interface IgFlowStats extends IgFlowRunSummary {
  /** Onde as execuções não concluídas estão paradas. */
  current: { nodeId: string | null; status: IgFlowRunStatus; count: number }[];
  /** Eventos do log agrupados por nó (ou id do botão, em postback/link_click). */
  events: { nodeId: string | null; event: string; count: number }[];
}

export interface IgFlowRunLogEntry {
  at: string;
  event: string;
  nodeId?: string;
  error?: string;
}

export interface IgFlowRun {
  id: string;
  channelId: string;
  contactExternalId: string;
  contactUsername: string | null;
  commentExternalId: string | null;
  mediaId: string | null;
  triggerText: string | null;
  status: IgFlowRunStatus;
  currentNodeId: string | null;
  lastInteractionAt: string | null;
  log: IgFlowRunLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export const igFlowsService = {
  async list(): Promise<IgFlow[]> {
    const { data } = await api.get('/ig-flows');
    return data.data;
  },
  async get(id: string): Promise<IgFlow> {
    const { data } = await api.get(`/ig-flows/${id}`);
    return data.data;
  },
  async stats(id: string): Promise<IgFlowStats> {
    const { data } = await api.get(`/ig-flows/${id}/stats`);
    return data.data;
  },
  async runs(id: string, limit = 100): Promise<IgFlowRun[]> {
    const { data } = await api.get(`/ig-flows/${id}/runs`, { params: { limit } });
    return data.data;
  },
};
