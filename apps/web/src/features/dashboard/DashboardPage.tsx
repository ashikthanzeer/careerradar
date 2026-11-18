import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Compass,
  Plus,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useAllEnrichedOpportunities } from '@/hooks/useOpportunities';
import { useApplications, useSavedOpportunities } from '@/hooks/useApplications';
import { useCareerProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateFeedback';
import { TrustBadge } from '@/components/shared/TrustBadge';
import { MatchBadge } from '@/components/shared/MatchBadge';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { CareerTelemetryPeakCharts } from '@/components/shared/CareerTelemetryPeakCharts';
import {
  APPLICATION_STATUS_META,
  ROLE_CATEGORY_LABELS,
  WORK_MODE_LABELS,
  formatCompensation,
  getDaysUntil,
} from '@/lib/utils';

export function DashboardPage() {
  const {
    data: opportunities,
    isLoading: oppsLoading,
    error: oppsError,
    refetch,
  } = useAllEnrichedOpportunities();
  const { data: savedList } = useSavedOpportunities();
  const { data: applications } = useApplications();
  const { data: profile } = useCareerProfile();

  if (oppsLoading) {
    return <LoadingState message="Loading your overview..." />;
  }

  if (oppsError || !opportunities) {
    return (
      <ErrorState
        message="Unable to load your dashboard."
        onRetry={() => refetch()}
      />
    );
  }

  const oppMap = new Map(opportunities.map((o) => [o.id, o]));

  const recommendedOpportunities = opportunities
    .filter((o) => o.trustAssessment.overallLabel !== 'elevated_risk')
    .sort((a, b) => b.recommendation.compositeScore - a.recommendation.compositeScore)
    .slice(0, 4);

  const activeApps = applications ?? [];
  const upcomingDeadlines = opportunities
    .filter((o) => {
      const days = getDaysUntil(o.deadline);
      return days !== null && days >= 0;
    })
    .sort((a, b) => {
      const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 5);

  const highRiskCount = opportunities.filter(
    (o) => o.trustAssessment.overallLabel === 'elevated_risk'
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Career Intelligence Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome,{' '}
            <strong className="font-semibold text-slate-800">
              {profile?.displayName ?? 'Jobseeker'}
            </strong>
            . You have {profile?.skills.length ?? 0} skills listed on your profile.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/profile">
            <Button variant="outline" size="sm">
              <UserCheck className="h-4 w-4" />
              <span>Edit My Skills</span>
            </Button>
          </Link>
          <Link to="/discover">
            <Button variant="primary" size="sm">
              <Compass className="h-4 w-4" />
              <span>Find &amp; Check Jobs</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Jobs
            </span>
            <Bookmark className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {savedList?.length ?? 0}
            </span>
            <Link
              to="/saved"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              View saved →
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Bookmarked jobs you want to review or apply to.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              My Applications
            </span>
            <Briefcase className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {activeApps.length}
            </span>
            <Link
              to="/applications"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Open tracker →
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Track your status from Applied to Interview and Offer.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Strong Skill Matches
            </span>
            <Sparkles className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {
                opportunities.filter(
                  (o) =>
                    o.recommendation.matchTier === 'strong_alignment' &&
                    o.trustAssessment.overallLabel !== 'elevated_risk'
                ).length
              }
            </span>
            <Link
              to="/discover?trustFilter=hide_elevated_risk&sortBy=relevance"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              View matches →
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Jobs matching 80% or more of your profile and skills.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              High-Risk Warnings
            </span>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-700 tabular-nums">
              {highRiskCount}
            </span>
            <Link
              to="/discover?trustFilter=all"
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Review →
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Listings flagged for registration fees or fake emails.
          </p>
        </Card>
      </div>

      {/* Live PeakChart Telemetry Section */}
      <CareerTelemetryPeakCharts opportunities={opportunities} />

      {/* Quick Onboarding Banner if User Has Added 0 Jobs or 0 Skills */}
      {opportunities.length === 0 && (
        <Card className="p-6 border-indigo-200 bg-indigo-50/30">
          <h2 className="text-base font-bold text-slate-900">
            Get started in two simple steps
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Your workspace starts completely clean with zero fake data. Here is how to use CareerRadar:
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <span className="text-xs font-bold uppercase text-indigo-600">
                Step 1
              </span>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                Add your skills on your Profile
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                List the programming languages, tools, and projects you know so we can calculate your match for every job.
              </p>
              <Link to="/profile" className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  Set Up My Skills
                </Button>
              </Link>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <span className="text-xs font-bold uppercase text-indigo-600">
                Step 2
              </span>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                Check &amp; Add a Job Listing
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Paste any internship or job post you found online to scan it for scam warning signs and track your application.
              </p>
              <Link to="/discover" className="mt-3 inline-block">
                <Button variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Check a Job Listing</span>
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Main Two-Column Grid */}
      {opportunities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Best Matches for Your Profile
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ranked by your skills, target role, and location preferences.
                  </p>
                </div>
                <Link
                  to="/discover"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  View all →
                </Link>
              </CardHeader>
              <CardContent className="divide-y divide-slate-200 p-0">
                {recommendedOpportunities.map((opp) => (
                  <div key={opp.id} className="p-5 hover:bg-slate-50/70 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link
                          to={`/opportunities/${opp.id}`}
                          className="text-sm font-bold text-slate-900 hover:text-indigo-600"
                        >
                          {opp.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-800">
                            {opp.organization.name}
                          </span>
                          <span>·</span>
                          <span>{opp.location}</span>
                          <span>·</span>
                          <span>{WORK_MODE_LABELS[opp.workMode]}</span>
                          <span>·</span>
                          <span className="font-mono text-slate-700">
                            {formatCompensation(
                              opp.compensationMin,
                              opp.compensationMax,
                              opp.compensationCurrency,
                              opp.compensationPeriod
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MatchBadge recommendation={opp.recommendation} compact />
                        <TrustBadge label={opp.trustAssessment.overallLabel} compact />
                      </div>
                    </div>

                    <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Match summary: </span>
                      {opp.recommendation.whyRecommended[0]}
                      {opp.skillGap.missingRequiredSkills.length > 0 ? (
                        <span className="block mt-1 text-amber-800">
                          <strong>Skills to brush up on:</strong>{' '}
                          {opp.skillGap.missingRequiredSkills.join(', ')}
                        </span>
                      ) : (
                        <span className="block mt-1 text-emerald-800">
                          <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                          You match all required skills for this role!
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <DeadlineBadge deadline={opp.deadline} />
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        <span>View Details</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    My Active Applications
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your next steps and current stages
                  </p>
                </div>
                <Link
                  to="/applications"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Open tracker →
                </Link>
              </CardHeader>
              <CardContent className="divide-y divide-slate-200 p-0">
                {activeApps.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No applications tracked yet.
                  </div>
                ) : (
                  activeApps.slice(0, 4).map((app) => {
                    const opp = oppMap.get(app.opportunityId);
                    const statusMeta = APPLICATION_STATUS_META[app.status];
                    return (
                      <div key={app.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              to={`/opportunities/${app.opportunityId}`}
                              className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-indigo-600"
                            >
                              {opp?.title ?? app.opportunityId}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {opp?.organization.name ?? 'Company'}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        {app.nextAction && (
                          <p className="rounded bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700">
                            <strong className="font-semibold text-slate-900">Next step:</strong>{' '}
                            {app.nextAction}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {upcomingDeadlines.length > 0 && (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-amber-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Upcoming Deadlines
                    </h2>
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-slate-200 p-0">
                  {upcomingDeadlines.map((opp) => (
                    <div
                      key={opp.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/opportunities/${opp.id}`}
                          className="block text-xs font-semibold text-slate-900 hover:text-indigo-600 truncate"
                        >
                          {opp.title}
                        </Link>
                        <span className="text-[11px] text-slate-500">
                          {opp.organization.name} · {ROLE_CATEGORY_LABELS[opp.roleCategory]}
                        </span>
                      </div>
                      <DeadlineBadge deadline={opp.deadline} className="shrink-0" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
