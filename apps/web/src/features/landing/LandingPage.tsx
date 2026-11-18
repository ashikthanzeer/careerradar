import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Compass,
  LogIn,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';

export function LandingPage() {
  const { isAuthenticated, session } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 dark:bg-indigo-600 text-white">
              <Radar className="h-4 w-4 text-indigo-400 dark:text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              CareerRadar
            </span>
          </div>

          <nav aria-label="Landing Navigation" className="flex items-center gap-2.5">
            <Link
              to="/discover"
              className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 px-2 py-1"
            >
              Find Jobs
            </Link>
            <ThemeToggle />
            {isAuthenticated ? (
              <Link to="/discover">
                <Button variant="primary" size="sm">
                  <span>Open Workspace ({session?.user.displayName})</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="primary" size="sm">
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign In</span>
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-900">
                <span>Smart Job &amp; Internship Companion</span>
              </div>
              <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                Spot fake job listings, check your skill match, and track every application in one place.
              </h1>
              <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
                Applying for internships and early-career roles shouldn&apos;t mean guessing which postings are real or losing track of deadlines. CareerRadar checks job descriptions for scam warning signs, compares requirements against your skills, and keeps your applications organized.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {isAuthenticated ? (
                  <Link to="/discover">
                    <Button variant="primary" size="lg">
                      <Compass className="h-4 w-4" />
                      <span>Go to Job Discovery</span>
                    </Button>
                  </Link>
                ) : (
                  <Link to="/login">
                    <Button variant="primary" size="lg">
                      <LogIn className="h-4 w-4" />
                      <span>Sign in with Google</span>
                    </Button>
                  </Link>
                )}
                <Link to="/discover">
                  <Button variant="outline" size="lg">
                    <span>Check a Job Listing</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3 Simple Pillars for Casual Jobseekers */}
            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3 pt-10 border-t border-slate-200 dark:border-slate-800">
              <Card className="p-5">
                <div className="inline-flex rounded-md bg-emerald-50 border border-emerald-200 p-2 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-900">
                  1. Instant Scam &amp; Safety Check
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Flags listings that ask for registration or training fees, use personal Gmail/Outlook addresses to impersonate well-known companies, or hide basic company details.
                </p>
              </Card>

              <Card className="p-5">
                <div className="inline-flex rounded-md bg-indigo-50 border border-indigo-200 p-2 text-indigo-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-900">
                  2. Clear Skill-Match Breakdown
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  See right away which required skills you already have on your profile and which skills to brush up on before your interview.
                </p>
              </Card>

              <Card className="p-5">
                <div className="inline-flex rounded-md bg-slate-100 border border-slate-300 p-2 text-slate-700">
                  <Briefcase className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-900">
                  3. Simple Application Tracker
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Save roles you like, track your stage from Applied to Interview and Offer, set next steps, and keep private interview notes in one clean view.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              How CareerRadar works
            </h2>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Sign in with Google
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Start with a clean personal workspace—no pre-filled dummy jobs or cluttered templates.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Paste any job listing you find online
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Copy a job post from LinkedIn, Internshala, Wellfound, or a company website to run a safety and skill-gap check.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Apply with confidence &amp; track deadlines
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Follow our verification checklist before submitting your resume and track every stage of your application.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 py-6 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <span>CareerRadar — Job Discovery, Scam Protection &amp; Application Tracker</span>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-slate-900">
              Sign In
            </Link>
            <Link to="/discover" className="hover:text-slate-900">
              Find Jobs
            </Link>
            <Link to="/applications" className="hover:text-slate-900">
              My Applications
            </Link>
            <Link to="/profile" className="hover:text-slate-900">
              My Profile
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
