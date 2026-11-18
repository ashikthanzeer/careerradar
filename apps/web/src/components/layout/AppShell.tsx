import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Briefcase,
  Compass,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Radar,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSavedOpportunities, useApplications } from '@/hooks/useApplications';
import { useCareerProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/Button';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const navigate = useNavigate();

  const { session, isAuthenticated, signOut } = useAuth();
  const { data: savedList } = useSavedOpportunities();
  const { data: applicationsList } = useApplications();
  const { data: profile } = useCareerProfile();

  const navItems = [
    {
      to: '/discover',
      label: 'Find & Check Jobs',
      icon: Compass,
    },
    {
      to: '/applications',
      label: 'My Applications',
      icon: Briefcase,
      badge: applicationsList?.length ?? 0,
    },
    {
      to: '/saved',
      label: 'Saved Jobs',
      icon: Bookmark,
      badge: savedList?.length ?? 0,
    },
    {
      to: '/profile',
      label: 'My Skills & Profile',
      icon: UserCheck,
    },
    {
      to: '/dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
    },
  ];

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickSearch.trim();
    if (trimmed) {
      navigate(`/discover?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/discover');
    }
    setMobileMenuOpen(false);
  };

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Primary Sidebar Navigation"
          className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 dark:lg:border-slate-800 lg:bg-white dark:lg:bg-slate-900 shrink-0"
        >
          <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
            <Link to="/discover" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 dark:bg-indigo-600 text-white">
                <Radar className="h-4 w-4 text-indigo-400 dark:text-white" />
              </div>
              <div>
                <span className="block text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
                  CareerRadar
                </span>
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  Job Search &amp; Safety
                </span>
              </div>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-indigo-600 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    )
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Signed-in User Account Card */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-3">
            {isAuthenticated && session ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {session.user.displayName}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {session.user.email}
                    </span>
                  </div>
                  <span className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-300">
                    {session.user.provider}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Sign in with Google to sync your profile and applications.
                </p>
                <Link to="/login" className="block">
                  <Button variant="primary" size="sm" className="w-full">
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Sign In</span>
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation menu"
                className="lg:hidden rounded-md p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link to="/discover" className="flex lg:hidden items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 dark:bg-indigo-600 text-white">
                  <Radar className="h-4 w-4 text-indigo-400 dark:text-white" />
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  CareerRadar
                </span>
              </Link>
            </div>

            <form onSubmit={handleQuickSearch} className="flex-1 max-w-md">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder="Search jobs by title, company, or skill..."
                  aria-label="Quick search opportunities"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-1.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </form>

            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <Link
                to="/profile"
                className="hidden sm:inline-block rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {profile?.skills.length ?? 0} My Skills
              </Link>
              <ThemeToggle />
              {!isAuthenticated && (
                <Link to="/login">
                  <Button variant="primary" size="sm">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </header>

          {/* Mobile Drawer Navigation */}
          {mobileMenuOpen && (
            <nav
              aria-label="Mobile Navigation"
              className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      )
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          )}

          {/* Main Route Outlet */}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
