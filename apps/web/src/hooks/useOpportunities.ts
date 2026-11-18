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
  });
}

export function useAllEnrichedOpportunities() {
  return useQuery({
    queryKey: OPPORTUNITY_QUERY_KEYS.allEnriched,
    queryFn: () => opportunitiesService.getAllEnrichedOpportunities(),
  });
}

export function useOpportunityDetail(opportunityId: string) {
  return useQuery({
    queryKey: OPPORTUNITY_QUERY_KEYS.detail(opportunityId),
    queryFn: () => opportunitiesService.getOpportunityById(opportunityId),
    enabled: Boolean(opportunityId),
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

