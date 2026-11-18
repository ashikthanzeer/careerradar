import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LandingPage } from '@/features/landing/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DiscoveryPage } from '@/features/discovery/DiscoveryPage';
import { OpportunityDetailPage } from '@/features/opportunities/OpportunityDetailPage';
import { SavedOpportunitiesPage } from '@/features/saved/SavedOpportunitiesPage';
import { ApplicationsPage } from '@/features/applications/ApplicationsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SystemsIntelligencePage } from '@/features/systems/SystemsIntelligencePage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useAuth } from '@/hooks/useAuth';

function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    );
  }

  return <Outlet />;
}

function RootEntry() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/discover" replace />;
  }
  return <LoginPage />;
}

export const appRoutes = [
  {
    path: '/',
    element: <RootEntry />,
  },
  {
    path: '/about',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/callback',
    element: <OAuthCallbackPage />,
  },
  {
    path: '/auth/callback/:provider',
    element: <OAuthCallbackPage />,
  },
  {
    path: '/api/auth/callback/:provider',
    element: <OAuthCallbackPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/dashboard',
            element: <DashboardPage />,
          },
          {
            path: '/discover',
            element: <DiscoveryPage />,
          },
          {
            path: '/opportunities/:opportunityId',
            element: <OpportunityDetailPage />,
          },
          {
            path: '/saved',
            element: <SavedOpportunitiesPage />,
          },
          {
            path: '/applications',
            element: <ApplicationsPage />,
          },
          {
            path: '/profile',
            element: <ProfilePage />,
          },
          {
            path: '/onboarding',
            element: <OnboardingPage />,
          },
          {
            path: '/systems',
            element: <SystemsIntelligencePage />,
          },
          {
            path: '*',
            element: <Navigate to="/discover" replace />,
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
