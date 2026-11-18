import { API_CONFIG, apiRequest } from './api-client';
import { opportunitiesService } from './opportunities.service';
import {
  computeLocalFreshnessStatus,
  computeLocalHybridSearch,
  executeLocalIngestionBatch,
  getLocalMlEvaluationReport,
  type FreshnessStatusReport,
  type HybridSearchResponse,
  type IngestionRunReport,
  type MlEvaluationReport,
} from '@/lib/systems-engine';

export const systemsService = {
  async runIngestionBatch(): Promise<IngestionRunReport> {
    if (API_CONFIG.dataMode === 'api') {
      return apiRequest<IngestionRunReport>('/ingestion/run', { method: 'POST' });
    }
    return executeLocalIngestionBatch();
  },

  async getFreshnessStatus(): Promise<FreshnessStatusReport> {
    if (API_CONFIG.dataMode === 'api') {
      return apiRequest<FreshnessStatusReport>('/ingestion/status');
    }
    const opps = await opportunitiesService.getAllEnrichedOpportunities();
    return computeLocalFreshnessStatus(opps);
  },

  async runHybridSearch(query: string, alpha = 0.45): Promise<HybridSearchResponse> {
    if (API_CONFIG.dataMode === 'api') {
      const sp = new URLSearchParams({ q: query, alpha: String(alpha) });
      return apiRequest<HybridSearchResponse>(`/ml/search?${sp.toString()}`);
    }
    const opps = await opportunitiesService.getAllEnrichedOpportunities();
    return computeLocalHybridSearch(opps, query, alpha);
  },

  async getMlEvaluationReport(): Promise<MlEvaluationReport> {
    if (API_CONFIG.dataMode === 'api') {
      return apiRequest<MlEvaluationReport>('/ml/evaluation');
    }
    return getLocalMlEvaluationReport();
  },
};

