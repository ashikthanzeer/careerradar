import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Globe,
  MapPin,
} from 'lucide-react';
import { useOpportunityDetail } from '@/hooks/useOpportunities';
import {
  useToggleSaveOpportunity,
  useUpsertApplication,
} from '@/hooks/useApplications';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/StateFeedback';
import { TrustBadge } from '@/components/shared/TrustBadge';
import { MatchBadge } from '@/components/shared/MatchBadge';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { TrustAssessmentPanel } from './TrustAssessmentPanel';
import { SkillGapPanel } from './SkillGapPanel';
import {
  APPLICATION_STATUS_META,
  OPPORTUNITY_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
  WORK_MODE_LABELS,
  formatCompensation,
  formatDateShort,
} from '@/lib/utils';
import type { ApplicationStatus } from '@/types/domain';

export function OpportunityDetailPage() {
  const { opportunityId = '' } = useParams<{ opportunityId: string }>();
  const {
    data: opportunity,
    isLoading,
    error,
    refetch,
  } = useOpportunityDetail(opportunityId);

  const toggleSaveMutation = useToggleSaveOpportunity();
  const upsertAppMutation = useUpsertApplication();

  const [trackerStatus, setTrackerStatus] = useState<ApplicationStatus>('applied');
  const [nextActionInput, setNextActionInput] = useState('');
  const [privateNotesInput, setPrivateNotesInput] = useState('');
  const [trackerFeedback, setTrackerFeedback] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState message="Loading opportunity analysis and verification evidence..." />;
  }

  if (error || !opportunity) {
    return (
      <div className="space-y-4">
        <Link
          to="/discover"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Discovery</span>
        </Link>
        <ErrorState
          title="Opportunity Not Found"
          message={
            error instanceof Error
              ? error.message
              : 'The requested opportunity ID could not be loaded.'
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const currentApp = opportunity.applicationRecord;
  const activeStatus = currentApp?.status ?? trackerStatus;

  const handleSaveTracker = (e: React.FormEvent) => {
    e.preventDefault();
    upsertAppMutation.mutate(
      {
        opportunityId: opportunity.id,
        status: activeStatus,
        nextAction:
          nextActionInput.trim() ||
          currentApp?.nextAction ||
          'Verify eligibility and submit application before deadline',
        privateNotes:
          privateNotesInput.trim() !== ''
            ? privateNotesInput
            : currentApp?.privateNotes ?? '',
      },
      {
        onSuccess: () => {
          setTrackerFeedback('Application tracker updated.');
          setTimeout(() => setTrackerFeedback(null), 3000);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/discover"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Opportunity Discovery</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span>ID: {opportunity.id}</span>
          <span>·</span>
          <span>
            Last verified: {formatDateShort(opportunity.lastSeenAt)}
          </span>
        </div>
      </div>

      {/* Primary Opportunity Header Card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}
            </Badge>
            <Badge variant="neutral">
              {ROLE_CATEGORY_LABELS[opportunity.roleCategory]}
            </Badge>
            <Badge variant="neutral">{opportunity.domain}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge label={opportunity.trustAssessment.overallLabel} />
            <MatchBadge recommendation={opportunity.recommendation} />
          </div>
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {opportunity.title}
        </h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span>{opportunity.organization.name}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-slate-400" />
            <span>
              {opportunity.location} ({WORK_MODE_LABELS[opportunity.workMode]})
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>{opportunity.duration}</span>
          </span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {formatCompensation(
              opportunity.compensationMin,
              opportunity.compensationMax,
              opportunity.compensationCurrency,
              opportunity.compensationPeriod
            )}
          </span>
          <DeadlineBadge deadline={opportunity.deadline} />
        </div>

        {/* Action Bar */}
        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant={opportunity.isSaved ? 'secondary' : 'outline'}
              size="md"
              onClick={() => toggleSaveMutation.mutate(opportunity.id)}
            >
              {opportunity.isSaved ? (
                <>
                  <BookmarkCheck className="h-4 w-4" />
                  <span>Saved to Bookmarks</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" />
                  <span>Save Opportunity</span>
                </>
              )}
            </Button>

            <a
              href={opportunity.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <span>Open Original Listing</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {currentApp && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Pipeline Stage:</span>
              <span
                className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold ${
                  APPLICATION_STATUS_META[currentApp.status].badgeClass
                }`}
              >
                {APPLICATION_STATUS_META[currentApp.status].label}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Main Two-Column Inspection Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Structured Intelligence, Original Description, Skill Gap, Trust */}
        <div className="lg:col-span-7 space-y-6">
          {/* Structured Opportunity Intelligence (PRD §6.2) */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Structured Opportunity Intelligence
                  </h2>
                  <p className="text-xs text-slate-500">
                    Schema-validated extraction · Provider: {opportunity.analysis.modelProvider} (
                    {opportunity.analysis.modelName})
                  </p>
                </div>
              </div>
              <Badge variant="indigo">
                Learning Value: {opportunity.analysis.learningValueAssessment.rating.toUpperCase()}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-5 text-xs sm:text-sm">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Executive Summary
                </h3>
                <p className="mt-1 text-slate-800 leading-relaxed">
                  {opportunity.analysis.shortSummary}
                </p>
                <p className="mt-1.5 text-xs text-slate-600">
                  <strong className="font-semibold text-slate-800">
                    Engineering &amp; Learning Rationale:{' '}
                  </strong>
                  {opportunity.analysis.learningValueAssessment.rationale}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Extracted Responsibilities
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {opportunity.analysis.responsibilities.map((resp, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Eligibility &amp; Cohort Criteria
                  </h3>
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-700 list-disc list-inside">
                    {opportunity.analysis.eligibilityRequirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Experience Expectations
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
                    {opportunity.analysis.experienceRequirements}
                  </p>
                </div>
              </div>

              {/* Ambiguities or Missing Info */}
              {opportunity.analysis.ambiguitiesOrMissingInfo.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <span>Ambiguities &amp; Unverified Fields (Not Invented by AI)</span>
                  </div>
                  <ul className="mt-1.5 space-y-1 list-disc list-inside text-amber-900">
                    {opportunity.analysis.ambiguitiesOrMissingInfo.map((amb, idx) => (
                      <li key={idx}>{amb}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skill Gap & Compatibility Panel */}
          <SkillGapPanel
            skillGap={opportunity.skillGap}
            recommendation={opportunity.recommendation}
          />

          {/* Original Unmodified Listing Text (PRD §6.2 & §14 requirement) */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Original Listing Text &amp; Source Provenance
                </h2>
              </div>
              <Badge variant="outline">Verbatim Source Record</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {opportunity.description}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Primary Source: </span>
                  <span>{opportunity.sources[0]?.sourceName ?? 'Direct Submission'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Recruiter Contact: </span>
                  <span className="font-mono">
                    {opportunity.recruiterContactEmail ?? 'Not listed'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">First Discovered: </span>
                  <span className="tabular-nums">
                    {formatDateShort(opportunity.firstSeenAt)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Last Checked: </span>
                  <span className="tabular-nums">
                    {formatDateShort(opportunity.lastSeenAt)}
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <a
                  href={opportunity.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-indigo-600 hover:underline break-all"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>{opportunity.applicationUrl}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 5 Columns: Trust Assessment & Application Tracker Box */}
        <div className="lg:col-span-5 space-y-6">
          {/* Inline Application Tracker Control */}
          <Card>
            <CardHeader className="bg-slate-50/70">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Track This Opportunity
                </h2>
                <Link
                  to="/applications"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Full pipeline →
                </Link>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Record application stage, next action, and private interview notes
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveTracker} className="space-y-3.5">
                <Select
                  label="Application Status"
                  value={activeStatus}
                  onChange={(e) => {
                    const nextStatus = e.target.value as ApplicationStatus;
                    setTrackerStatus(nextStatus);
                    if (currentApp) {
                      upsertAppMutation.mutate({
                        opportunityId: opportunity.id,
                        status: nextStatus,
                      });
                    }
                  }}
                >
                  {Object.entries(APPLICATION_STATUS_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </Select>

                <div>
                  <label
                    htmlFor="tracker-next-action"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Next Action / Milestone
                  </label>
                  <input
                    id="tracker-next-action"
                    type="text"
                    defaultValue={currentApp?.nextAction ?? ''}
                    onChange={(e) => setNextActionInput(e.target.value)}
                    placeholder="e.g. Submit tailored resume & GitHub portfolio by Friday"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tracker-private-notes"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Private Evaluation Notes
                  </label>
                  <textarea
                    id="tracker-private-notes"
                    rows={3}
                    defaultValue={currentApp?.privateNotes ?? ''}
                    onChange={(e) => setPrivateNotesInput(e.target.value)}
                    placeholder="Record OA topics, interviewer names, or questions to ask..."
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Deadline: {formatDateShort(opportunity.deadline)}
                  </span>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={upsertAppMutation.isPending}
                  >
                    {currentApp ? 'Update Tracker Record' : 'Add to Application Tracker'}
                  </Button>
                </div>

                {trackerFeedback && (
                  <p
                    role="status"
                    className="rounded bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-800"
                  >
                    {trackerFeedback}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Trust & Verification Panel */}
          <TrustAssessmentPanel
            assessment={opportunity.trustAssessment}
            organization={opportunity.organization}
          />
        </div>
      </div>
    </div>
  );
}

