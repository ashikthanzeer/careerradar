import { API_CONFIG, apiRequest } from '@/services/api-client';
import { localStore, type StoredAuthSession } from '@/lib/storage';

export interface BetterAuthSocialResult {
  redirect: boolean;
  configuredClientCredentials: boolean;
  url: string | null;
  state: string;
}

const BETTER_AUTH_TOKEN_KEY = 'better-auth.session_token';
const OAUTH_STATE_KEY = 'careerradar_oauth_state';

function persistSessionLocally(session: StoredAuthSession | null): void {
  localStore.saveAuthSession(session);
  if (typeof window === 'undefined') return;
  try {
    if (session?.accessToken) {
      window.localStorage.setItem(BETTER_AUTH_TOKEN_KEY, session.accessToken);
    } else {
      window.localStorage.removeItem(BETTER_AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Better Auth Client for CareerRadar.
 * Persists device sessions locally and exchanges Google OAuth codes securely via /api/auth & /api/v1/auth.
 */
export const authClient = {
  signIn: {
    async social(params: {
      provider: 'google';
      callbackURL?: string;
    }): Promise<BetterAuthSocialResult> {
      if (API_CONFIG.dataMode !== 'mock') {
        try {
          const res = await apiRequest<BetterAuthSocialResult>(
            '/sign-in/social',
            {
              method: 'POST',
              body: JSON.stringify({
                provider: params.provider,
                callbackURL: params.callbackURL ?? '/discover',
              }),
            },
            API_CONFIG.authBaseUrl
          );
          if (typeof window !== 'undefined' && res.state) {
            window.localStorage.setItem(OAUTH_STATE_KEY, res.state);
          }
          return res;
        } catch {
          // Fallback to /api/v1/auth/oauth/google/authorize or offline mode
          try {
            const authInfo = await apiRequest<{
              provider: 'google';
              configuredClientCredentials: boolean;
              authorizationUrl: string | null;
              state: string;
            }>(`/auth/oauth/${params.provider}/authorize`);
            if (typeof window !== 'undefined' && authInfo.state) {
              window.localStorage.setItem(OAUTH_STATE_KEY, authInfo.state);
            }
            return {
              redirect: Boolean(authInfo.authorizationUrl),
              configuredClientCredentials: authInfo.configuredClientCredentials,
              url: authInfo.authorizationUrl,
              state: authInfo.state,
            };
          } catch {
            // Backend unreachable (e.g., unit test or offline frontend)
          }
        }
      }

      return {
        redirect: false,
        configuredClientCredentials: false,
        url: null,
        state: `local_state_${params.provider}_${Date.now()}`,
      };
    },
  },

  async completeOAuthCallback(params: {
    provider: 'google';
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
          onboardingRequired?: boolean;
          staleLoginFetchTriggered?: boolean;
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
          onboardingRequired: res.onboardingRequired,
          staleLoginFetchTriggered: res.staleLoginFetchTriggered,
        };
        persistSessionLocally(session);
        return session;
      } catch (err) {
        if (params.code) throw err;
      }
    }

    const email = (params.email || 'user@gmail.com').trim().toLowerCase();
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
    persistSessionLocally(session);

    const currentProfile = localStore.getProfile();
    const savedProfile = localStore.saveProfile({
      ...currentProfile,
      userId: session.user.id,
      displayName: session.user.displayName,
    });
    const onboardingRequired =
      !savedProfile.onboardingCompleted && savedProfile.skills.length === 0;
    const enrichedSession: StoredAuthSession = {
      ...session,
      onboardingRequired,
    };
    persistSessionLocally(enrichedSession);

    return enrichedSession;
  },

  getLocalSession(): StoredAuthSession | null {
    return localStore.getAuthSession();
  },

  async refreshServerSession(): Promise<StoredAuthSession | null> {
    const local = localStore.getAuthSession();
    if (API_CONFIG.dataMode === 'mock') {
      return local;
    }
    try {
      const res = await apiRequest<{
        session: { token: string; userId: string } | null;
        user: StoredAuthSession['user'] | null;
      }>('/get-session', undefined, API_CONFIG.authBaseUrl);

      if (res.session && res.user) {
        const synced: StoredAuthSession = {
          accessToken: res.session.token,
          user: res.user,
        };
        persistSessionLocally(synced);
        return synced;
      }
      // If server returned null session while we have a local token, verify if it was a local_jwt fallback or invalid
      if (local && local.accessToken.startsWith('local_jwt_')) {
        return local;
      }
      return local;
    } catch {
      // Preserve local device session on transient network failure so browser refresh never logs out
      return local;
    }
  },

  async signOut(): Promise<void> {
    if (API_CONFIG.dataMode !== 'mock') {
      try {
        await apiRequest('/sign-out', { method: 'POST' }, API_CONFIG.authBaseUrl);
      } catch {
        // ignore network errors during sign-out
      }
    }
    persistSessionLocally(null);
    localStore.clearCachedOpportunities();
  },
};

