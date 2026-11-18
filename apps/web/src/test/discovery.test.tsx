import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/hooks/useTheme';
import { AuthProvider } from '@/hooks/useAuth';
import { appRoutes } from '@/app/router';
import { opportunitiesService } from '@/services/opportunities.service';
import { applicationsService } from '@/services/applications.service';
import { localStore } from '@/lib/storage';
import { formatCleanText, formatCompensation, formatLocationWithMode } from '@/lib/utils';
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

function signInTestUser() {
  localStore.saveAuthSession({
    accessToken: 'test-device-token-priya',
    user: {
      id: 'user-priya-1',
      email: 'priya@gmail.com',
      displayName: 'Priya Nair',
      provider: 'google',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
  });
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

  it('TC-02b: renders Login interface at / by default and protects /discover from unauthenticated access', async () => {
    renderWithRouter('/');
    expect(
      screen.getByRole('button', { name: /Continue with Google/i })
    ).toBeInTheDocument();

    renderWithRouter('/discover');
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Continue with Google/i }).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('TC-02c: keeps user signed in across refreshes when device session exists', async () => {
    signInTestUser();
    renderWithRouter('/discover');

    await waitFor(() => {
      expect(screen.getByText('Priya Nair')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Check \/ Add a Job Listing/i })
      ).toBeInTheDocument();
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

    signInTestUser();
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
    signInTestUser();
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

  it('TC-06: extracts LinkedIn job title and company when clicking Fetch Details from Link', async () => {
    const user = userEvent.setup();
    signInTestUser();
    renderWithRouter('/discover');

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Check \/ Add a Job Listing/i })
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Check \/ Add a Job Listing/i })
    );

    const urlInput = screen.getByLabelText(
      /Job Link \(URL from LinkedIn, Internshala, Indeed, or Company Site\)/i
    );
    await user.clear(urlInput);
    await user.type(
      urlInput,
      'https://www.linkedin.com/jobs/view/backend-software-engineer-intern-at-stripe-4091823'
    );

    await user.click(
      screen.getByRole('button', { name: /Fetch Details from Link/i })
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Job Title/i)).toHaveValue(
        'Backend Software Engineer Intern'
      );
      expect(screen.getByLabelText(/Company Name/i)).toHaveValue('Stripe');
      const modalWorkMode = screen
        .getAllByLabelText(/Work Mode/i)
        .find((el) => el.getAttribute('name') === 'workMode');
      expect(modalWorkMode).toHaveValue('unknown');
      expect(screen.getByLabelText(/City \/ Location/i)).toHaveValue('Not available');
      expect(screen.getByLabelText(/Duration/i)).toHaveValue('Not available');
    });
  });

  it('TC-07: onboarding extracts resume skills, auto-fetches jobs on save, and enforces 2/day fetch cap', async () => {
    const user = userEvent.setup();
    signInTestUser();
    renderWithRouter('/onboarding');

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Or Paste Resume Text/i)
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/Or Paste Resume Text/i),
      'Built distributed backend systems in Python, FastAPI, Docker, and PostgreSQL.'
    );
    await user.click(
      screen.getByRole('button', { name: /Extract Skills & Field from Resume/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Python')).toBeInTheDocument();
      expect(screen.getByText('FastAPI')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Complete Setup & Fetch Matching Jobs/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Fetch Live Jobs \(1\/2 left\)/i })
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Fetch Live Jobs \(1\/2 left\)/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Daily Fetch Limit Reached \(0\/2\)/i })
      ).toBeDisabled();
    });

    expect(
      formatCleanText(
        '&lt;div class=&quot;content-intro&quot;&gt;&lt;strong&gt;Mavericks Wanted&lt;/strong&gt;&lt;/div&gt;'
      )
    ).toBe('Mavericks Wanted');
    expect(formatLocationWithMode('Remote', 'remote')).toBe('Remote');
    expect(formatLocationWithMode('Bengaluru, India', 'hybrid')).toBe(
      'Bengaluru, India (Hybrid)'
    );
    expect(formatLocationWithMode('Not available', 'unknown')).toBe('Not available');
    expect(formatLocationWithMode('Bengaluru, India', 'unknown')).toBe(
      'Bengaluru, India'
    );
    expect(formatLocationWithMode('Not available', 'remote')).toBe('Remote');
    expect(formatCompensation(null, null, null, 'unknown')).toBe('Not available');
  });

  it('TC-08: saves fetched jobs locally and filters/paginates without re-fetching on preference or page change', async () => {
    signInTestUser();
    const openRemote = await opportunitiesService.createAndEvaluateOpportunity({
      title: 'Backend Go Intern',
      organizationName: 'LocalCache Labs',
      officialWebsite: 'https://localcache.example',
      opportunityType: 'internship',
      roleCategory: 'software_engineering',
      domain: 'Developer Tools & Cloud',
      location: 'Remote (Global)',
      workMode: 'remote',
      compensationMin: 60000,
      compensationCurrency: 'INR',
      compensationPeriod: 'monthly',
      duration: '6 months',
      deadline: '2027-01-30',
      applicationUrl: 'https://localcache.example/jobs/go-intern',
      sourceName: 'Greenhouse',
      description: 'Build distributed Go services and Docker tooling.',
    });
    const openPython = await opportunitiesService.createAndEvaluateOpportunity({
      title: 'Python API Intern',
      organizationName: 'CacheScale Corp',
      officialWebsite: 'https://cachescale.example',
      opportunityType: 'internship',
      roleCategory: 'software_engineering',
      domain: 'Developer Tools & Cloud',
      location: 'Remote (India)',
      workMode: 'remote',
      compensationMin: 50000,
      compensationCurrency: 'INR',
      compensationPeriod: 'monthly',
      duration: '6 months',
      deadline: '2027-01-30',
      applicationUrl: 'https://cachescale.example/jobs/py-intern',
      sourceName: 'Ashby',
      description: 'Build FastAPI services with PostgreSQL.',
    });
    const closedJob = {
      ...openPython,
      id: 'opp_closed_99',
      title: 'Closed Internship',
      description: 'This position is closed and no longer accepting applications.',
    };

    localStore.saveCachedOpportunities([openRemote, openPython, closedJob]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const page1 = await opportunitiesService.listOpportunities({ page: 1, pageSize: 1 });
    const page2 = await opportunitiesService.listOpportunities({ page: 2, pageSize: 1 });
    const filteredGo = await opportunitiesService.listOpportunities({ q: 'Go', page: 1, pageSize: 5 });

    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
    expect(filteredGo.items.map((i) => i.title)).toEqual(['Backend Go Intern']);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('TC-09: handles /auth/callback OAuth code exchange, validates CSRF state, and handles errors gracefully', async () => {
    // 1. Google error parameter renders clean Sign-In Error state with link back to /login
    renderWithRouter('/auth/callback?error=access_denied&error_description=User%20cancelled');
    await waitFor(() => {
      expect(screen.getByText('Sign-In Error')).toBeInTheDocument();
      expect(screen.getByText(/access_denied: User cancelled/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Return to Sign In/i })).toHaveAttribute(
        'href',
        '/login'
      );
    });

    // 2. CSRF state mismatch is rejected on the frontend before calling backend
    cleanup();
    localStore.resetAllToDefaults();
    window.localStorage.setItem('careerradar_oauth_state', 'signed_expected_state');
    renderWithRouter('/auth/callback?code=auth_code_123&state=tampered_state');
    await waitFor(() => {
      expect(screen.getByText('Sign-In Error')).toBeInTheDocument();
      expect(screen.getByText(/OAuth state mismatch/i)).toBeInTheDocument();
    });

    // 3. Valid code + matching state exchanges token via backend API and redirects to requested route
    cleanup();
    localStore.resetAllToDefaults();
    API_CONFIG.dataMode = 'api';
    window.localStorage.setItem('careerradar_oauth_state', 'signed_expected_state');
    window.localStorage.setItem('careerradar_post_login_redirect', '/dashboard');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const targetUrl = typeof input === 'string' ? input : input.toString();
      if (targetUrl.includes('/auth/oauth/google/callback')) {
        return new Response(
          JSON.stringify({
            accessToken: 'jwt_oauth_verified_123',
            tokenType: 'bearer',
            onboardingRequired: false,
            user: {
              id: 'usr_google_1',
              email: 'priya@gmail.com',
              displayName: 'Priya Nair',
              provider: 'google',
              createdAt: '2026-11-18T10:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (targetUrl.includes('/get-session')) {
        return new Response(JSON.stringify({ session: null, user: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (targetUrl.includes('/opportunities')) {
        return new Response(
          JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderWithRouter('/auth/callback?code=auth_code_123&state=signed_expected_state');
    await waitFor(() => {
      expect(localStore.getAuthSession()?.accessToken).toBe('jwt_oauth_verified_123');
      expect(screen.queryByText(/Completing secure Google sign-in/i)).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem('careerradar_oauth_state')).toBeNull();

    API_CONFIG.dataMode = 'mock';
    fetchMock.mockRestore();
  });
});
