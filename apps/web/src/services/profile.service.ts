import { API_CONFIG, apiRequest } from './api-client';
import { localStore } from '@/lib/storage';
import type { CareerProfile } from '@/types/domain';

export const profileService = {
  async getProfile(): Promise<CareerProfile> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<CareerProfile>('/profile');
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    return localStore.getProfile();
  },

  async updateProfile(profile: CareerProfile): Promise<CareerProfile> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<CareerProfile>('/profile', {
          method: 'PUT',
          body: JSON.stringify(profile),
        });
      } catch (err) {
        if (API_CONFIG.dataMode === 'api') throw err;
      }
    }
    return localStore.saveProfile(profile);
  },
};
