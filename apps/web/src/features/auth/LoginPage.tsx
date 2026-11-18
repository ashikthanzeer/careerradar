import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lock, Radar, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export function LoginPage() {
  const { isAuthenticated, signInWithProvider } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/discover';

  const [showGoogleForm, setShowGoogleForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Persistent device session: if already signed in locally, never prompt login again
  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleGoogleClick = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const authInfo = await authService.initiateOAuth('google');
      if (authInfo.configuredClientCredentials && authInfo.authorizationUrl) {
        window.location.href = authInfo.authorizationUrl;
        return;
      }
      setShowGoogleForm(true);
    } catch {
      setShowGoogleForm(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();
    if (cleanName.length < 2) {
      setError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid Google email address.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const created = await signInWithProvider({
        provider: 'google',
        email: cleanEmail,
        displayName: cleanName,
      });
      const destination =
        created.onboardingRequired && redirectTo === '/discover'
          ? '/onboarding'
          : redirectTo;
      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to complete Google sign-in.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 dark:bg-indigo-600 text-white">
              <Radar className="h-4 w-4 text-indigo-400 dark:text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">CareerRadar</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/about"
              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              About CareerRadar
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sign in to CareerRadar
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Check jobs from LinkedIn, Internshala &amp; Indeed for scams, see how your skills match, and track your applications.
            </p>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="bg-slate-50/70 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Lock className="h-3.5 w-3.5 text-indigo-600" />
                <span>Sign in with your Google Account</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {!showGoogleForm ? (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGoogleClick}
                  className="w-full flex items-center justify-between rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  <span className="flex items-center gap-3">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                      />
                    </svg>
                    <span>
                      {isLoading ? 'Connecting to Google...' : 'Continue with Google'}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>
              ) : (
                <form onSubmit={handleIdentitySubmit} className="space-y-4" noValidate>
                  <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs">
                    <span className="font-semibold text-indigo-900">
                      Sign in with your Google account
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGoogleForm(false);
                        setError(null);
                      }}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      Back
                    </button>
                  </div>

                  <Input
                    label="Your Full Name *"
                    placeholder="e.g. Priya Nair"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />

                  <Input
                    label="Google Email Address *"
                    type="email"
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  {error && (
                    <p role="alert" className="text-xs font-medium text-rose-600">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? 'Signing in...' : 'Sign in with Google'}
                  </Button>
                </form>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Your login is saved on this device so refreshing never logs you out.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Full data export and one-click account deletion available anytime.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
