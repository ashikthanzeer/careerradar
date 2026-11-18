import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applicationsService,
  type UpsertApplicationInput,
} from '@/services/applications.service';
import { OPPORTUNITY_QUERY_KEYS } from './useOpportunities';
import type { ApplicationRecord } from '@/types/domain';

export const APPLICATION_QUERY_KEYS = {
  saved: ['saved-opportunities'] as const,
  applications: ['applications'] as const,
};

export function useSavedOpportunities() {
  return useQuery({
    queryKey: APPLICATION_QUERY_KEYS.saved,
    queryFn: () => applicationsService.listSavedOpportunities(),
  });
}

export function useToggleSaveOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opportunityId: string) =>
      applicationsService.toggleSaveOpportunity(opportunityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_QUERY_KEYS.saved });
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

export function useApplications() {
  return useQuery({
    queryKey: APPLICATION_QUERY_KEYS.applications,
    queryFn: () => applicationsService.listApplications(),
  });
}

export function useUpsertApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertApplicationInput) =>
      applicationsService.upsertApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_QUERY_KEYS.applications });
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      patch,
    }: {
      applicationId: string;
      patch: Partial<
        Pick<
          ApplicationRecord,
          'status' | 'appliedAt' | 'deadline' | 'nextAction' | 'privateNotes'
        >
      >;
    }) => applicationsService.updateApplicationById(applicationId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_QUERY_KEYS.applications });
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      applicationsService.deleteApplication(applicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPLICATION_QUERY_KEYS.applications });
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

