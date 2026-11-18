import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
  Filter,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useCareerProfile } from '@/hooks/useProfile';
import {
  useCreateOpportunity,
  useExtractJobUrl,
  useFetchLiveJobs,
  useOpportunitiesList,
} from '@/hooks/useOpportunities';
import {
  useToggleSaveOpportunity,
  useUpsertApplication,
} from '@/hooks/useApplications';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateFeedback';
import { OpportunityCard } from './OpportunityCard';
import {
  SubmitOpportunityModal,
  type JobPrefillData,
} from './SubmitOpportunityModal';
import {
  ALL_ROLE_CATEGORIES,
  ROLE_CATEGORY_LABELS,
} from '@/lib/utils';
import type {
  CreateOpportunityInput,
  OpportunityFilterParams,
  OpportunityType,
  RoleCategory,
  WorkMode,
} from '@/types/domain';

const POPULAR_SKILLS = [
  'Python',
  'TypeScript',
  'React',
  'SQL',
  'Docker',
  'FastAPI',
  'PyTorch',
  'Go',
  'Kubernetes',
  'Rust',
];

export function DiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [urlImportInput, setUrlImportInput] = useState('');
  const [prefillData, setPrefillData] = useState<JobPrefillData | null>(null);
  const [liveFetchStatus, setLiveFetchStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  const q = searchParams.get('q') ?? '';
  const opportunityType = (searchParams.get('opportunityType') ?? 'all') as
    | OpportunityType
    | 'all';
  const roleCategory = (searchParams.get('roleCategory') ?? 'all') as
    | RoleCategory
    | 'all';
  const workMode = (searchParams.get('workMode') ?? 'all') as WorkMode | 'all';
  const region = (searchParams.get('region') ?? 'all') as
    | 'all'
    | 'native'
    | 'worldwide';
  const trustFilter = (searchParams.get('trustFilter') ?? 'all') as
    | 'all'
    | 'no_major_warnings_only'
    | 'hide_elevated_risk';
  const paidOnly = searchParams.get('paidOnly') === 'true';
  const skill = searchParams.get('skill') ?? '';
  const sortBy = (searchParams.get('sortBy') ?? 'relevance') as NonNullable<
    OpportunityFilterParams['sortBy']
  >;
  const page = Number(searchParams.get('page') ?? '1') || 1;

  const [searchInput, setSearchInput] = useState(q);

  const filterParams: OpportunityFilterParams = {
    q,
    opportunityType,
    roleCategory,
    workMode,
    region,
    trustFilter,
    paidOnly,
    skill,
    sortBy,
    page,
    pageSize: 12,
  };

  const { data: profile } = useCareerProfile();
  const { data, isLoading, error, refetch } = useOpportunitiesList(filterParams);
  const toggleSaveMutation = useToggleSaveOpportunity();
  const upsertApplicationMutation = useUpsertApplication();
  const createOpportunityMutation = useCreateOpportunity();
  const extractJobUrlMutation = useExtractJobUrl();
  const fetchLiveJobsMutation = useFetchLiveJobs();
  const staleTriggeredRef = useRef(false);

  const remainingTriggers = profile?.triggersRemainingToday ?? 2;
  const maxTriggers = profile?.maxTriggersPerDay ?? 2;

  useEffect(() => {
    if (
      profile?.isStaleForLoginTrigger &&
      remainingTriggers > 0 &&
      !staleTriggeredRef.current
    ) {
      staleTriggeredRef.current = true;
      fetchLiveJobsMutation
        .mutateAsync({ triggerSource: 'stale_login', limit: 50 })
        .then((res) => {
          if (res.triggered && (res.report?.newOpportunitiesCreated ?? 0) > 0) {
            setLiveFetchStatus(
              `Welcome back! Synced ${res.report?.newOpportunitiesCreated} new job alert(s) (${res.nativeCount ?? 0} in ${res.nativeCountry ?? profile?.nativeCountry ?? 'your country'} + ${res.worldwideCount ?? 0} worldwide). ${res.triggersRemainingToday ?? 0}/${res.maxTriggersPerDay ?? 2} daily triggers remaining.`
            );
          }
        })
        .catch(() => {});
    }
  }, [
    profile?.isStaleForLoginTrigger,
    profile?.nativeCountry,
    remainingTriggers,
    fetchLiveJobsMutation,
  ]);

  const updateParam = (key: string, value: string | boolean) => {
    const next = new URLSearchParams(searchParams);
    if (
      value === '' ||
      value === 'all' ||
      value === false ||
      (key === 'sortBy' && value === 'relevance')
    ) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('q', searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const handleQuickTrack = (opportunityId: string) => {
    upsertApplicationMutation.mutate({
      opportunityId,
      status: 'interested',
      nextAction: 'Review role requirements and apply before deadline',
    });
  };

  const handleCreateAndEvaluate = async (input: CreateOpportunityInput) => {
    const created = await createOpportunityMutation.mutateAsync(input);
    navigate(`/opportunities/${created.id}`);
  };

  const handleImportByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlImportInput.trim();
    if (!trimmed) return;
    try {
      const extracted = await extractJobUrlMutation.mutateAsync(trimmed);
      setPrefillData(extracted);
      setSubmitModalOpen(true);
    } catch {
      setPrefillData({
        applicationUrl: trimmed,
        extractionNotice: 'Enter or review the job details below.',
        partialExtraction: true,
      });
      setSubmitModalOpen(true);
    }
  };

  const handleFetchLiveJobs = async () => {
    setLiveFetchStatus(null);
    try {
      const res = await fetchLiveJobsMutation.mutateAsync({
        query: searchInput.trim() || undefined,
        limit: 50,
        triggerSource: 'manual',
      });
      const nativeCountryName = res.nativeCountry ?? profile?.nativeCountry ?? 'your country';
      const geoBreakdown = `${res.nativeCount ?? 0} ${nativeCountryName} + ${res.worldwideCount ?? 0} worldwide`;
      if (res.rateLimited) {
        setLiveFetchStatus(
          res.reason || `Maximum of ${maxTriggers} job fetch triggers per day reached.`
        );
      } else if ((res.report?.newOpportunitiesCreated ?? 0) > 0) {
        setLiveFetchStatus(
          `Synced ${res.report?.newOpportunitiesCreated} new internship(s) (${geoBreakdown}) across ${(res.sourcesQueried ?? []).slice(0, 3).join(', ')} (${res.triggersRemainingToday ?? 0}/${res.maxTriggersPerDay ?? 2} daily triggers left).`
        );
      } else if ((res.warnings ?? []).length > 0) {
        setLiveFetchStatus(
          `${res.warnings?.[0]} Synced catalog (${geoBreakdown}) — ${res.triggersRemainingToday ?? 0}/${res.maxTriggersPerDay ?? 2} daily triggers left.`
        );
      } else {
        setLiveFetchStatus(
          `Tier-1 & public job boards checked (${geoBreakdown}); all matching listings are up to date (${res.triggersRemainingToday ?? 0}/${res.maxTriggersPerDay ?? 2} daily triggers left).`
        );
      }
    } catch (err) {
      setLiveFetchStatus(
        err instanceof Error ? err.message : 'Unable to fetch live jobs right now.'
      );
    }
  };

  const activeFilterCount = [
    q !== '',
    opportunityType !== 'all',
    roleCategory !== 'all',
    workMode !== 'all',
    region !== 'all',
    trustFilter !== 'all',
    paidOnly,
    skill !== '',
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Find &amp; Check Jobs
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Import a job link from LinkedIn, Internshala, Indeed, or a company site—or sync live public listings—to check for scams and see your skill match.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            disabled={fetchLiveJobsMutation.isPending || remainingTriggers <= 0}
            onClick={handleFetchLiveJobs}
          >
            {fetchLiveJobsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Syncing Live Jobs...</span>
              </>
            ) : (
              <>
                <DownloadCloud className="h-4 w-4" />
                <span>
                  {remainingTriggers > 0
                    ? `Fetch Live Jobs (${remainingTriggers}/${maxTriggers} left)`
                    : 'Daily Fetch Limit Reached (0/2)'}
                </span>
              </>
            )}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setPrefillData(null);
              setSubmitModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Check / Add a Job Listing</span>
          </Button>
        </div>
      </div>

      {profile && !profile.onboardingCompleted && profile.skills.length === 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-3 text-xs text-indigo-950 dark:text-indigo-100">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Complete your onboarding by uploading your resume (.pdf, .docx, .txt) or linking LinkedIn &amp; your Portfolio to automatically pull Tier-1 jobs for your field.
            </span>
          </div>
          <Link
            to="/onboarding"
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
          >
            Complete Onboarding &rarr;
          </Link>
        </div>
      )}

      {liveFetchStatus && (
        <div
          role="status"
          className="rounded-md border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-2.5 text-xs font-medium text-indigo-900 dark:text-indigo-100"
        >
          {liveFetchStatus}
        </div>
      )}

      {/* Quick Import Job by URL Card */}
      <Card className="p-4 border-indigo-200/80 dark:border-indigo-900/80 bg-indigo-50/30 dark:bg-indigo-950/30">
        <form onSubmit={handleImportByUrl} className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500"
              aria-hidden="true"
            />
            <input
              type="url"
              value={urlImportInput}
              onChange={(e) => setUrlImportInput(e.target.value)}
              placeholder="Paste a LinkedIn, Internshala, Indeed, or company job URL to fetch & check safety..."
              aria-label="Import job URL"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="md"
            disabled={extractJobUrlMutation.isPending}
          >
            {extractJobUrlMutation.isPending ? 'Fetching Job...' : 'Fetch Job Details'}
          </Button>
        </form>
      </Card>

      {/* Search & Primary Sort Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by job title, company, skill, or city..."
                aria-label="Search jobs"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2 sm:w-64">
            <SlidersHorizontal
              className="h-4 w-4 text-slate-400 shrink-0 hidden sm:block"
              aria-hidden="true"
            />
            <Select
              aria-label="Sort jobs"
              value={sortBy}
              onChange={(e) => updateParam('sortBy', e.target.value)}
            >
              <option value="relevance">Sort: Best Skill Match</option>
              <option value="deadline_asc">Sort: Closing Soonest</option>
              <option value="posted_desc">Sort: Recently Added</option>
              <option value="stipend_desc">Sort: Highest Pay</option>
            </Select>
          </div>
        </div>

        {/* Quick Skill Filter Pills */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 mr-1">
            Filter by skill:
          </span>
          {POPULAR_SKILLS.map((s) => {
            const isActive = skill.toLowerCase() === s.toLowerCase();
            return (
              <button
                key={s}
                type="button"
                onClick={() => updateParam('skill', isActive ? '' : s)}
                className={`rounded border px-2 py-0.5 text-xs font-mono transition-colors ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Main Content Layout: Left Filter Sidebar + Right Results List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-3 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Filters</h2>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/70 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                  {activeFilterCount}
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear all</span>
              </button>
            )}
          </div>

          <Select
            label="Location Region"
            value={region}
            onChange={(e) => updateParam('region', e.target.value)}
          >
            <option value="all">
              All Regions ({profile?.nativeCountry || 'Native'} + Worldwide)
            </option>
            <option value="native">
              Native Country ({profile?.nativeCountry || 'India'})
            </option>
            <option value="worldwide">Worldwide / Rest of World</option>
          </Select>

          <Select
            label="Safety Filter"
            value={trustFilter}
            onChange={(e) => updateParam('trustFilter', e.target.value)}
          >
            <option value="all">Show All Jobs</option>
            <option value="hide_elevated_risk">Hide High-Risk Scam Warnings</option>
            <option value="no_major_warnings_only">Only Verified Safe Jobs</option>
          </Select>

          <Select
            label="Job Type"
            value={opportunityType}
            onChange={(e) => updateParam('opportunityType', e.target.value)}
          >
            <option value="all">All Job Types</option>
            <option value="internship">Internships</option>
            <option value="graduate">Full-Time / New Grad</option>
            <option value="open_source">Open-Source Programmes</option>
            <option value="fellowship">Fellowships</option>
            <option value="research">Research Roles</option>
          </Select>

          <Select
            label="Role Area"
            value={roleCategory}
            onChange={(e) => updateParam('roleCategory', e.target.value)}
          >
            <option value="all">All Role Areas</option>
            {ALL_ROLE_CATEGORIES.map((roleKey) => (
              <option key={roleKey} value={roleKey}>
                {ROLE_CATEGORY_LABELS[roleKey]}
              </option>
            ))}
          </Select>

          <Select
            label="Work Mode"
            value={workMode}
            onChange={(e) => updateParam('workMode', e.target.value)}
          >
            <option value="all">Any Work Mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">In-Office / On-site</option>
          </Select>

          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={paidOnly}
                onChange={(e) => updateParam('paidOnly', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Paid roles only
              </span>
            </label>
          </div>
        </Card>

        {/* Opportunity Results Column */}
        <div className="lg:col-span-9 space-y-4">
          {isLoading ? (
            <LoadingState message="Loading jobs..." />
          ) : error || !data ? (
            <ErrorState
              message="Unable to load jobs."
              onRetry={() => refetch()}
            />
          ) : data.items.length === 0 ? (
            <EmptyState
              title={
                activeFilterCount > 0
                  ? 'No jobs match your current filters'
                  : 'No job listings added yet'
              }
              description={
                activeFilterCount > 0
                  ? 'Try clearing your active filters or search query.'
                  : 'Paste a job URL from LinkedIn, Internshala, or Indeed above—or click Fetch Live Jobs—to check listings for scams and see your skill match.'
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      Clear filters
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setPrefillData(null);
                      setSubmitModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Check / Add Your First Job Listing</span>
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>
                  Showing{' '}
                  <strong className="font-semibold text-slate-900 tabular-nums">
                    {(data.page - 1) * data.pageSize + 1}–
                    {Math.min(data.page * data.pageSize, data.total)}
                  </strong>{' '}
                  of{' '}
                  <strong className="font-semibold text-slate-900 tabular-nums">
                    {data.total}
                  </strong>{' '}
                  jobs
                </span>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
              </div>

              <div className="space-y-4">
                {data.items.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    onToggleSave={(id) => toggleSaveMutation.mutate(id)}
                    onQuickTrack={handleQuickTrack}
                    isSaving={toggleSaveMutation.isPending}
                  />
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs text-slate-600">
                    Page <strong className="text-slate-900">{data.page}</strong> of{' '}
                    <strong className="text-slate-900">{data.totalPages}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page <= 1}
                      onClick={() => updateParam('page', String(data.page - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page >= data.totalPages}
                      onClick={() => updateParam('page', String(data.page + 1))}
                    >
                      <span>Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <SubmitOpportunityModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        onSubmitOpportunity={handleCreateAndEvaluate}
        isSubmitting={createOpportunityMutation.isPending}
        initialPrefill={prefillData}
      />
    </div>
  );
}
