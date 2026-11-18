import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState } from '@/components/ui/StateFeedback';
import type { OAuthProviderId } from '@/services/auth.service';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signInWithProvider } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const provider = (searchParams.get('provider') || 'google') as OAuthProviderId;
    const code = searchParams.get('code') || undefined;
    const state = searchParams.get('state') || undefined;

    if (!code) {
      setErrorMessage('No authorization code received from OAuth provider.');
      return;
    }

    signInWithProvider({ provider, code, state })
      .then(() => {
        navigate('/discover', { replace: true });
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to complete OAuth sign-in.'
        );
      });
  }, [searchParams, signInWithProvider, navigate]);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <ErrorState title="Sign-In Error" message={errorMessage} />
          <Link
            to="/login"
            className="inline-block text-sm font-semibold text-indigo-600 hover:underline"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoadingState message="Completing secure sign-in..." />
    </div>
  );
}

