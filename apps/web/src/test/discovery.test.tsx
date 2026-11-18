import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/hooks/useTheme';
import { AuthProvider } from '@/hooks/useAuth';
import { appRoutes } from '@/app/router';
import { opportunitiesService } from '@/services/opportunities.service';
import { applicationsService } from '@/services/applications.service';
import { localStore } from '@/lib/storage';
import { API_CONFIG } from '@/services/api-client';

function renderWithRouter(initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const memoryRouter = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={memoryRouter} />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('Production Audit: Zero Dummy Data, OAuth Login, Scam Protection & UI Journeys', () => {
  beforeEach(() => {
    API_CONFIG.dataMode = 'mock';
    localStore.resetAllToDefaults();
  });

  it('TC-01: starts with zero dummy opportunities, zero saved jobs, and zero applications', async () => {
    const opps = await opportunitiesService.listOpportunities();
    expect(opps.total).toBe(0);
    expect(opps.items).toHaveLength(0);

    const saved = await applicationsService.listSavedOpportunities();
    expect(saved).toHaveLength(0);

    const apps = await applicationsService.listApplications();
    expect(apps).toHaveLength(0);
  });

  it('TC-02: signs in with Google on /login and displays user session in sidebar', async () => {
    const user = userEvent.setup();
    renderWithRouter('/login');

    expect(
      screen.getByRole('button', { name: /Continue with Google/i })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Continue with Google/i })
    );

    const nameInput = screen.getByLabelText(/Your Full Name/i);
    const emailInput = screen.getByLabelText(/Google Email Address/i);
    await user.type(nameInput, 'Priya Nair');
    await user.type(emailInput, 'priya@gmail.com');

    await user.click(
      screen.getByRole('button', { name: /Sign in with Google/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Priya Nair')).toBeInTheDocument();
      expect(screen.getByText('priya@gmail.com')).toBeInTheDocument();
    });
  });

  it('TC-03: evaluates user-submitted jobs, flags upfront fee scams, and filters by skill & safety', async () => {
    const legit = await opportunitiesService.createAndEvaluateOpportunity({
      title: 'Systems Engineering Intern (Rust & Linux)',
      organizationName: 'Cloudflare',
      officialWebsite: 'https://cloudflare.com',
      recruiterContactEmail: 'interns@cloudflare.com',
      opportunityType: 'internship',
      roleCategory: 'systems_infrastructure',
      domain: 'Developer Tools & Cloud',
      location: 'Remote',
      workMode: 'remote',
      compensationMin: 75000,
      compensationMax: 85000,
      compensationCurrency: 'INR',
      compensationPeriod: 'monthly',
      duration: '6 months',
      applicationUrl: 'https://boards.greenhouse.io/cloudflare/jobs/501',
      sourceName: 'Greenhouse',
      description:
        'Work with our systems team building low-latency networking tools in Rust, Python, Linux, and Docker.',
    });

    const scam = await opportunitiesService.createAndEvaluateOpportunity({
      title: 'Cloud Security Intern (Instant Offer)',
      organizationName: 'Suspicious Cert Portal',
      opportunityType: 'internship',
      roleCategory: 'security',
      domain: 'Cybersecurity',
      location: 'Remote',
      workMode: 'remote',
      compensationPeriod: 'unpaid',
      duration: '2 months',
      applicationUrl: 'https://forms.gle/scam-test',
      recruiterContactEmail: 'hr.portal@gmail.com',
      sourceName: 'Social Feed',
      description:
        'Direct selection with no interview! Candidates must pay a registration fee of ₹2,000 for security training and certificate.',
    });

    expect(legit.trustAssessment.overallLabel).toBe('no_major_warnings');
    expect(scam.trustAssessment.overallLabel).toBe('elevated_risk');

    const safeRes = await opportunitiesService.listOpportunities({
      trustFilter: 'hide_elevated_risk',
    });
    expect(safeRes.total).toBe(1);
    expect(safeRes.items[0].id).toBe(legit.id);

    const rustRes = await opportunitiesService.listOpportunities({
      skill: 'Rust',
    });
    expect(rustRes.total).toBe(1);
    expect(rustRes.items[0].id).toBe(legit.id);
  });

  it('TC-04: saves jobs, tracks application status, and renders Opportunity Detail page', async () => {
    const created = await opportunitiesService.createAndEvaluateOpportunity({
      title: 'AI & Data Science Virtual Intern',
      organizationName: 'Apex Portal',
      opportunityType: 'internship',
      roleCategory: 'machine_learning',
      domain: 'AI & Machine Learning',
      location: 'Remote',
      workMode: 'remote',
      compensationPeriod: 'unpaid',
      duration: '1 month',
      applicationUrl: 'https://forms.gle/apex-intern',
      recruiterContactEmail: 'apex@gmail.com',
      sourceName: 'Social Feed',
      description:
        'Direct selection! Selected students must pay a mandatory registration fee of ₹1,999 for portal onboarding.',
    });

    const toggled = await applicationsService.toggleSaveOpportunity(created.id);
    expect(toggled.saved).toBe(true);

    const appRecord = await applicationsService.upsertApplication({
      opportunityId: created.id,
      status: 'interested',
      nextAction: 'Verify company before applying',
    });
    expect(appRecord.status).toBe('interested');

    renderWithRouter(`/opportunities/${created.id}`);

    await waitFor(() => {
      expect(
        screen.getByText(/AI & Data Science Virtual Intern/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByText('FEE_REQUIRED')).toBeInTheDocument();
  });

  it('TC-05: validates form inputs in Check/Add Job modal and toggles Dark/Light mode on Overview', async () => {
    const user = userEvent.setup();
    renderWithRouter('/discover');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Check \/ Add a Job Listing/i })
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Check \/ Add a Job Listing/i })
    );

    await user.click(
      screen.getByRole('button', { name: /Check Safety & Skill Match/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Job title must be at least 4 characters/i)
      ).toBeInTheDocument();
    });

    // Verify Dark/Light mode toggle
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const toggleBtn = screen.getByRole('button', {
      name: /Switch to light mode/i,
    });
    await user.click(toggleBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
