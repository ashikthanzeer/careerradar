import { API_CONFIG, apiRequest } from './api-client';
import { authClient, type BetterAuthSocialResult } from '@/lib/auth-client';
import { localStore, type StoredAuthSession } from '@/lib/storage';

export type OAuthProviderId = 'google';

export interface OAuthAuthorizeInfo {
  provider: OAuthProviderId;
  configuredClientCredentials: boolean;
  authorizationUrl: string | null;
  state: string;
}

export const authService = {
  getCurrentSession(): StoredAuthSession | null {
    return authClient.getLocalSession();
  },

  async initiateOAuth(provider: OAuthProviderId): Promise<OAuthAuthorizeInfo> {
    const res: BetterAuthSocialResult = await authClient.signIn.social({
      provider,
      callbackURL: '/discover',
    });
    return {
      provider,
      configuredClientCredentials: res.configuredClientCredentials,
      authorizationUrl: res.url,
      state: res.state,
    };
  },

  async completeOAuthSignIn(params: {
    provider: OAuthProviderId;
    code?: string;
    state?: string;
    email?: string;
    displayName?: string;
  }): Promise<StoredAuthSession> {
    return authClient.completeOAuthCallback(params);
  },

  async refreshSession(): Promise<StoredAuthSession | null> {
    return authClient.refreshServerSession();
  },

  async exportAccountData(): Promise<Record<string, unknown>> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<Record<string, unknown>>('/auth/export');
      } catch {
        // Fallback to local export
      }
    }
    return {
      exportedAt: new Date().toISOString(),
      user: localStore.getAuthSession()?.user ?? null,
      profile: localStore.getProfile(),
      savedOpportunities: localStore.getSavedOpportunities(),
      applications: localStore.getApplications(),
    };
  },

  async deleteAccount(): Promise<void> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        await apiRequest('/auth/account', { method: 'DELETE' });
      } catch {
        // Ignore if offline
      }
    }
    localStore.resetAllToDefaults();
  },

  signOut(): void {
    void authClient.signOut();
  },
};
