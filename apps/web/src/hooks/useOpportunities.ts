import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opportunitiesService } from '@/services/opportunities.service';
import type { CreateOpportunityInput, OpportunityFilterParams } from '@/types/domain';

export const OPPORTUNITY_QUERY_KEYS = {
  all: ['opportunities'] as const,
  list: (params: OpportunityFilterParams) => ['opportunities', 'list', params] as const,
  allEnriched: ['opportunities', 'all-enriched'] as const,
  detail: (id: string) => ['opportunities', 'detail', id] as const,
};

export function useOpportunitiesList(params: OpportunityFilterParams) {
  return useQuery({
    queryKey: OPPORTUNITY_QUERY_KEYS.list(params),
    queryFn: () => opportunitiesService.listOpportunities(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllEnrichedOpportunities() {
  return useQuery({
    queryKey: OPPORTUNITY_QUERY_KEYS.allEnriched,
    queryFn: () => opportunitiesService.getAllEnrichedOpportunities(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useOpportunityDetail(opportunityId: string) {
  return useQuery({
    queryKey: OPPORTUNITY_QUERY_KEYS.detail(opportunityId),
    queryFn: () => opportunitiesService.getOpportunityById(opportunityId),
    enabled: Boolean(opportunityId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOpportunityInput) =>
      opportunitiesService.createAndEvaluateOpportunity(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

export function useExtractJobUrl() {
  return useMutation({
    mutationFn: (url: string) => opportunitiesService.extractJobFromUrl(url),
  });
}

export function useFetchLiveJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: {
      query?: string;
      limit?: number;
      triggerSource?: 'manual' | 'profile_save' | 'stale_login';
    }) =>
      opportunitiesService.fetchLivePublicJobs(
        params?.query,
        params?.limit,
        params?.triggerSource ?? 'manual'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['career-profile'] });
    },
  });
}
