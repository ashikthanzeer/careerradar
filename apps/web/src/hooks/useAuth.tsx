import React, { createContext, useContext, useState } from 'react';
import { authService, type OAuthProviderId } from '@/services/auth.service';
import type { StoredAuthSession } from '@/lib/storage';

interface AuthContextValue {
  session: StoredAuthSession | null;
  isAuthenticated: boolean;
  signInWithProvider: (params: {
    provider: OAuthProviderId;
    email?: string;
    displayName?: string;
    code?: string;
    state?: string;
  }) => Promise<StoredAuthSession>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  isAuthenticated: false,
  signInWithProvider: async () => {
    throw new Error('AuthProvider not initialized');
  },
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredAuthSession | null>(() =>
    authService.getCurrentSession()
  );

  const signInWithProvider: AuthContextValue['signInWithProvider'] = async (
    params
  ) => {
    const created = await authService.completeOAuthSignIn(params);
    setSession(created);
    return created;
  };

  const signOut = () => {
    authService.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: Boolean(session),
        signInWithProvider,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

