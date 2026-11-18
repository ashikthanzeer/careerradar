import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { OAUTH_POST_LOGIN_REDIRECT_KEY } from '@/lib/auth-client';
import { LoadingState, ErrorState } from '@/components/ui/StateFeedback';
import type { OAuthProviderId } from '@/services/auth.service';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { provider: providerParam } = useParams<{ provider?: string }>();
  const navigate = useNavigate();
  const { signInWithProvider } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoking single-use OAuth code exchange
    if (processedRef.current) return;
    processedRef.current = true;

    const oauthError = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    if (oauthError) {
      const details = errorDescription ? `: ${errorDescription}` : '';
      setErrorMessage(`Google sign-in was cancelled or denied (${oauthError}${details}).`);
      return;
    }

    const rawProvider = (providerParam || searchParams.get('provider') || 'google').toLowerCase();
    if (rawProvider !== 'google') {
      setErrorMessage(`Unsupported OAuth provider (${rawProvider}). Only Google sign-in is enabled.`);
      return;
    }
    const provider: OAuthProviderId = 'google';
    const code = searchParams.get('code') || undefined;
    const state = searchParams.get('state') || undefined;

    if (!code) {
      setErrorMessage('No authorization code received from Google.');
      return;
    }

    if (!state) {
      setErrorMessage('Missing OAuth security state parameter. Please try signing in again.');
      return;
    }

    let postLoginRedirect = '/discover';
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(OAUTH_POST_LOGIN_REDIRECT_KEY);
      if (saved && saved.startsWith('/') && !saved.startsWith('//') && saved !== '/login') {
        postLoginRedirect = saved;
      }
      window.localStorage.removeItem(OAUTH_POST_LOGIN_REDIRECT_KEY);
    }

    signInWithProvider({ provider, code, state })
      .then((created) => {
        navigate(created.onboardingRequired ? '/onboarding' : postLoginRedirect, {
          replace: true,
        });
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to complete Google sign-in.'
        );
      });
  }, [searchParams, providerParam, signInWithProvider, navigate]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <ErrorState title="Sign-In Error" message={errorMessage} />
          <Link
            to="/login"
            className="inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <LoadingState message="Completing secure Google sign-in..." />
    </div>
  );
}
