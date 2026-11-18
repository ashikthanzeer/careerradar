import { API_CONFIG, ApiClientError, apiRequest } from './api-client';
import { localStore } from '@/lib/storage';
import type {
  ApplicationRecord,
  ApplicationStatus,
  SavedOpportunity,
} from '@/types/domain';

export interface UpsertApplicationInput {
  opportunityId: string;
  status: ApplicationStatus;
  appliedAt?: string | null;
  deadline?: string | null;
  nextAction?: string;
  privateNotes?: string;
}

export const applicationsService = {
  async listSavedOpportunities(): Promise<SavedOpportunity[]> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<SavedOpportunity[]>('/saved-opportunities');
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    return localStore.getSavedOpportunities();
  },

  async toggleSaveOpportunity(
    opportunityId: string
  ): Promise<{ saved: boolean; items: SavedOpportunity[] }> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const current = await apiRequest<SavedOpportunity[]>('/saved-opportunities');
        const exists = current.some((s) => s.opportunityId === opportunityId);
        if (exists) {
          await apiRequest(`/opportunities/${opportunityId}/save`, {
            method: 'DELETE',
          });
        } else {
          await apiRequest(`/opportunities/${opportunityId}/save`, {
            method: 'POST',
          });
        }
        const updated = await apiRequest<SavedOpportunity[]>('/saved-opportunities');
        return { saved: !exists, items: updated };
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    const current = localStore.getSavedOpportunities();
    const exists = current.some((s) => s.opportunityId === opportunityId);
    let next: SavedOpportunity[];

    if (exists) {
      next = current.filter((s) => s.opportunityId !== opportunityId);
    } else {
      next = [
        {
          id: `saved_${Date.now().toString(36)}`,
          userId: localStore.getAuthSession()?.user.id ?? 'usr_local',
          opportunityId,
          savedAt: new Date().toISOString(),
        },
        ...current,
      ];
    }

    localStore.saveSavedOpportunities(next);
    return { saved: !exists, items: next };
  },

  async listApplications(): Promise<ApplicationRecord[]> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<ApplicationRecord[]>('/applications');
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    return localStore.getApplications();
  },

  async upsertApplication(input: UpsertApplicationInput): Promise<ApplicationRecord> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<ApplicationRecord>('/applications', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    const now = new Date().toISOString();
    const list = localStore.getApplications();
    const existingIdx = list.findIndex((a) => a.opportunityId === input.opportunityId);

    const opp = localStore
      .getAllOpportunities()
      .find((o) => o.id === input.opportunityId);

    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      const updated: ApplicationRecord = {
        ...existing,
        status: input.status,
        appliedAt:
          input.appliedAt !== undefined
            ? input.appliedAt
            : input.status === 'applied' && !existing.appliedAt
              ? now
              : existing.appliedAt,
        deadline: input.deadline !== undefined ? input.deadline : existing.deadline,
        nextAction: input.nextAction !== undefined ? input.nextAction : existing.nextAction,
        privateNotes:
          input.privateNotes !== undefined ? input.privateNotes : existing.privateNotes,
        updatedAt: now,
      };
      const next = [...list];
      next[existingIdx] = updated;
      localStore.saveApplications(next);
      return updated;
    }

    const created: ApplicationRecord = {
      id: `app_${Date.now().toString(36)}`,
      userId: localStore.getAuthSession()?.user.id ?? 'usr_local',
      opportunityId: input.opportunityId,
      status: input.status,
      appliedAt: input.status === 'applied' ? input.appliedAt ?? now : input.appliedAt ?? null,
      deadline: input.deadline ?? opp?.deadline ?? null,
      nextAction: input.nextAction ?? 'Prepare and submit application',
      privateNotes: input.privateNotes ?? '',
      createdAt: now,
      updatedAt: now,
    };

    localStore.saveApplications([created, ...list]);
    return created;
  },

  async updateApplicationById(
    applicationId: string,
    patch: Partial<
      Pick<
        ApplicationRecord,
        'status' | 'appliedAt' | 'deadline' | 'nextAction' | 'privateNotes'
      >
    >
  ): Promise<ApplicationRecord> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<ApplicationRecord>(
          `/applications/${applicationId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(patch),
          }
        );
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }

    const list = localStore.getApplications();
    const idx = list.findIndex((a) => a.id === applicationId);
    if (idx === -1) {
      throw new ApiClientError(`Application ${applicationId} not found`, 404);
    }

    const existing = list[idx];
    const now = new Date().toISOString();
    const updated: ApplicationRecord = {
      ...existing,
      ...patch,
      appliedAt:
        patch.appliedAt !== undefined
          ? patch.appliedAt
          : patch.status === 'applied' && !existing.appliedAt
            ? now
            : existing.appliedAt,
      updatedAt: now,
    };

    const next = [...list];
    next[idx] = updated;
    localStore.saveApplications(next);
    return updated;
  },

  async deleteApplication(applicationId: string): Promise<void> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        await apiRequest(`/applications/${applicationId}`, { method: 'DELETE' });
        return;
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    const list = localStore.getApplications();
    localStore.saveApplications(list.filter((a) => a.id !== applicationId));
  },
};
