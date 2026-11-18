import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileService } from '@/services/profile.service';
import { OPPORTUNITY_QUERY_KEYS } from './useOpportunities';
import type { CareerProfile } from '@/types/domain';

export const PROFILE_QUERY_KEY = ['career-profile'] as const;

export function useCareerProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => profileService.getProfile(),
  });
}

export function useUpdateCareerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: CareerProfile) => profileService.updateProfile(profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      // Updating profile skills/preferences immediately updates opportunity match & skill-gap scores
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
    },
  });
}

export function useExtractResume() {
  return useMutation({
    mutationFn: (input: { text?: string; filename?: string; fileBase64?: string }) =>
      profileService.extractFromResume(input),
  });
}

export function useExtractSources() {
  return useMutation({
    mutationFn: (input: {
      linkedinUrl?: string;
      portfolioUrl?: string;
      githubUrl?: string;
      pastedText?: string;
    }) => profileService.extractFromSources(input),
  });
}

