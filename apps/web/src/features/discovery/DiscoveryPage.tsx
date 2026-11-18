import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useCreateOpportunity,
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
import { SubmitOpportunityModal } from './SubmitOpportunityModal';
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
  const navigate = useNavigate();

  const q = searchParams.get('q') ?? '';
  const opportunityType = (searchParams.get('opportunityType') ?? 'all') as
    | OpportunityType
    | 'all';
  const roleCategory = (searchParams.get('roleCategory') ?? 'all') as
    | RoleCategory
    | 'all';
  const workMode = (searchParams.get('workMode') ?? 'all') as WorkMode | 'all';
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
    trustFilter,
    paidOnly,
    skill,
    sortBy,
    page,
    pageSize: 6,
  };

  const { data, isLoading, error, refetch } = useOpportunitiesList(filterParams);
  const toggleSaveMutation = useToggleSaveOpportunity();
  const upsertApplicationMutation = useUpsertApplication();
  const createOpportunityMutation = useCreateOpportunity();

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

  const activeFilterCount = [
    q !== '',
    opportunityType !== 'all',
    roleCategory !== 'all',
    workMode !== 'all',
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
            Search verified opportunities or paste any job listing from LinkedIn, Internshala, or a company page to check its safety and your skill match.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setSubmitModalOpen(true)}
        >
          <Plus className="h-4 w-4" />
          <span>Check / Add a Job Listing</span>
        </Button>
      </div>

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
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
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
              <h2 className="text-sm font-bold text-slate-900">Filters</h2>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                  {activeFilterCount}
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear all</span>
              </button>
            )}
          </div>

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
            <option value="software_engineering">Software Engineering</option>
            <option value="machine_learning">AI &amp; Machine Learning</option>
            <option value="systems_infrastructure">Cloud &amp; DevOps</option>
            <option value="data_science">Data Science &amp; Analytics</option>
            <option value="security">Cybersecurity</option>
            <option value="research">Research</option>
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
                  : 'Paste any internship or job listing you found on LinkedIn, Internshala, Wellfound, or a company career page to check if it is safe, see your skill match, and track your application.'
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
                    onClick={() => setSubmitModalOpen(true)}
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
      />
    </div>
  );
}
