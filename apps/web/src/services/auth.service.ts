import { API_CONFIG, apiRequest } from './api-client';
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
    return localStore.getAuthSession();
  },

  async initiateOAuth(provider: OAuthProviderId): Promise<OAuthAuthorizeInfo> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        return await apiRequest<OAuthAuthorizeInfo>(
          `/auth/oauth/${provider}/authorize`
        );
      } catch {
        // Fallback when running frontend standalone without backend process
      }
    }
    return {
      provider,
      configuredClientCredentials: false,
      authorizationUrl: null,
      state: `local_state_${provider}_${Date.now()}`,
    };
  },

  async completeOAuthSignIn(params: {
    provider: OAuthProviderId;
    code?: string;
    state?: string;
    email?: string;
    displayName?: string;
  }): Promise<StoredAuthSession> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        const res = await apiRequest<{
          accessToken: string;
          user: StoredAuthSession['user'];
        }>(`/auth/oauth/${params.provider}/callback`, {
          method: 'POST',
          body: JSON.stringify({
            code: params.code,
            state: params.state,
            email: params.email,
            displayName: params.displayName,
          }),
        });
        const session: StoredAuthSession = {
          accessToken: res.accessToken,
          user: res.user,
        };
        localStore.saveAuthSession(session);
        return session;
      } catch (err) {
        if (params.code) throw err;
      }
    }

    const email = (params.email || `user@${params.provider}.com`).trim().toLowerCase();
    const displayName =
      params.displayName?.trim() || email.split('@')[0] || 'Jobseeker';
    const idHash = Array.from(email)
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
      .toString(16);

    const session: StoredAuthSession = {
      accessToken: `local_jwt_${params.provider}_${idHash}`,
      user: {
        id: `usr_${idHash}`,
        email,
        displayName,
        provider: params.provider,
        createdAt: new Date().toISOString(),
      },
    };
    localStore.saveAuthSession(session);

    // Ensure profile displayName matches user's sign-in name
    const currentProfile = localStore.getProfile();
    localStore.saveProfile({
      ...currentProfile,
      userId: session.user.id,
      displayName: session.user.displayName,
    });

    return session;
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
    localStore.saveAuthSession(null);
  },
};

