import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  PlusCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TrustBadge } from '@/components/shared/TrustBadge';
import { MatchBadge } from '@/components/shared/MatchBadge';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import {
  APPLICATION_STATUS_META,
  OPPORTUNITY_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
  WORK_MODE_LABELS,
  formatCompensation,
  formatDateShort,
} from '@/lib/utils';
import type { EnrichedOpportunity } from '@/types/domain';

interface OpportunityCardProps {
  opportunity: EnrichedOpportunity;
  onToggleSave: (opportunityId: string) => void;
  onQuickTrack: (opportunityId: string) => void;
  isSaving?: boolean;
}

export function OpportunityCard({
  opportunity,
  onToggleSave,
  onQuickTrack,
  isSaving = false,
}: OpportunityCardProps) {
  const primarySource = opportunity.sources[0];
  const isHighRisk = opportunity.trustAssessment.overallLabel === 'elevated_risk';

  return (
    <Card
      className={`p-5 transition-colors ${
        isHighRisk
          ? 'border-rose-200 bg-rose-50/15'
          : 'hover:border-slate-300 bg-white'
      }`}
    >
      {/* Top Row: Badges (Opportunity Type, Provenance, Trust, Compatibility) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}
          </Badge>
          <Badge variant="neutral">
            {ROLE_CATEGORY_LABELS[opportunity.roleCategory]}
          </Badge>
          {primarySource && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
              via {primarySource.sourceName}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <TrustBadge label={opportunity.trustAssessment.overallLabel} compact />
          <MatchBadge recommendation={opportunity.recommendation} compact />
        </div>
      </div>

      {/* Title & Organization */}
      <div className="mt-3">
        <Link
          to={`/opportunities/${opportunity.id}`}
          className="text-base sm:text-lg font-bold text-slate-900 hover:text-indigo-600 transition-colors"
        >
          {opportunity.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
            <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>{opportunity.organization.name}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>
              {opportunity.location} ({WORK_MODE_LABELS[opportunity.workMode]})
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>{opportunity.duration}</span>
          </span>
          <span className="font-mono font-semibold text-slate-800 tabular-nums">
            {formatCompensation(
              opportunity.compensationMin,
              opportunity.compensationMax,
              opportunity.compensationCurrency,
              opportunity.compensationPeriod
            )}
          </span>
        </div>
      </div>

      {/* Short Intelligence Summary */}
      <p className="mt-2.5 text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
        {opportunity.analysis.shortSummary}
      </p>

      {/* High-Risk Evidence Callout if Elevated Risk */}
      {isHighRisk && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <strong className="font-semibold">Risk Indicator Triggered: </strong>
          {opportunity.trustAssessment.evidence.find((e) => e.severity === 'high')
            ?.description ?? opportunity.trustAssessment.assessmentSummary}
        </div>
      )}

      {/* Skills Row with Profile Match Status */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        {opportunity.skillGap.items.slice(0, 7).map((item) => {
          const isMatched = item.status !== 'unverified_gap';
          return (
            <span
              key={item.skillName}
              title={
                item.status === 'matched_explicit'
                  ? 'Matched via your explicit profile skills'
                  : item.status === 'matched_inferred'
                    ? item.matchedVia
                    : 'Not currently listed on your profile'
              }
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono ${
                isMatched
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {isMatched && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
              <span>{item.skillName}</span>
            </span>
          );
        })}
      </div>

      {/* Footer Row: Provenance, Dates, & Actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <DeadlineBadge deadline={opportunity.deadline} />
          {opportunity.postedAt && (
            <span className="hidden sm:inline tabular-nums">
              Posted {formatDateShort(opportunity.postedAt)}
            </span>
          )}
          <a
            href={opportunity.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
            title="Original listing URL"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Source URL</span>
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => onToggleSave(opportunity.id)}
            aria-label={
              opportunity.isSaved
                ? `Remove ${opportunity.title} from saved`
                : `Save ${opportunity.title}`
            }
          >
            {opportunity.isSaved ? (
              <>
                <BookmarkCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5" />
                <span>Save</span>
              </>
            )}
          </Button>

          {opportunity.applicationRecord ? (
            <Link to="/applications">
              <span
                className={`inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium ${
                  APPLICATION_STATUS_META[opportunity.applicationRecord.status].badgeClass
                }`}
              >
                Tracked: {APPLICATION_STATUS_META[opportunity.applicationRecord.status].label}
              </span>
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onQuickTrack(opportunity.id)}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Track</span>
            </Button>
          )}

          <Link to={`/opportunities/${opportunity.id}`}>
            <Button variant="primary" size="sm">
              <span>Inspect Details</span>
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

