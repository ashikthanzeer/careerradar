import { createBrowserRouter, Navigate } from 'react-router-dom';
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

export const appRoutes = [
  {
    path: '/',
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
        path: '/systems',
        element: <SystemsIntelligencePage />,
      },
      {
        path: '*',
        element: <Navigate to="/discover" replace />,
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
