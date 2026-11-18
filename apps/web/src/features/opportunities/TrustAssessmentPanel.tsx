import { CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TrustBadge } from '@/components/shared/TrustBadge';
import type { Organization, TrustAssessment } from '@/types/domain';

interface TrustAssessmentPanelProps {
  assessment: TrustAssessment;
  organization: Organization;
}

export function TrustAssessmentPanel({
  assessment,
  organization,
}: TrustAssessmentPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Trust &amp; Credibility Assessment
            </h2>
            <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
              {assessment.rulesetVersion}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Evidence-based evaluation of domain alignment, contact metadata, and risk indicators
          </p>
        </div>
        <TrustBadge label={assessment.overallLabel} />
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Summary */}
        <div
          className={`rounded-md border p-3.5 text-xs sm:text-sm leading-relaxed ${assessment.overallLabel === 'elevated_risk'
            ? 'border-rose-200 bg-rose-50 text-rose-950'
            : assessment.overallLabel === 'verification_required'
              ? 'border-amber-200 bg-amber-50/70 text-amber-950'
              : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
        >
          <p className="font-medium">{assessment.assessmentSummary}</p>
        </div>

        {/* Organization Verification Context */}
        <div className="rounded-md border border-slate-200 p-3.5 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-900">
              Organization Identity: {organization.name}
            </span>
            {organization.officialWebsite ? (
              <a
                href={organization.officialWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-indigo-600 hover:underline"
              >
                {organization.officialWebsite}
              </a>
            ) : (
              <Badge variant="amber">No Official Website Recorded</Badge>
            )}
          </div>
          <p className="text-slate-600">{organization.verificationMetadata.notes}</p>
        </div>

        {/* Observable Evidence Breakdown */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
            Observable Evidence &amp; Triggered Rules ({assessment.evidence.length})
          </h3>
          <div className="space-y-2.5">
            {assessment.evidence.map((ev) => (
              <div
                key={ev.id}
                className="rounded-md border border-slate-200 bg-white p-3.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900">
                    {ev.indicatorCode}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        ev.severity === 'high'
                          ? 'rose'
                          : ev.severity === 'medium'
                            ? 'amber'
                            : ev.severity === 'positive'
                              ? 'emerald'
                              : 'neutral'
                      }
                    >
                      {ev.severity === 'positive'
                        ? 'POSITIVE SIGNAL'
                        : `${ev.severity.toUpperCase()} RISK`}
                    </Badge>
                    <Badge variant="outline">
                      {ev.evidenceType.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1.5 text-slate-700 leading-relaxed">{ev.description}</p>
                <p className="mt-1.5 rounded bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600 border border-slate-100">
                  Reference: {ev.evidenceReference}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Verification Steps */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Recommended Verification Steps Before Applying
          </h3>
          <ul className="space-y-1.5">
            {assessment.recommendedVerificationSteps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Mandatory Certainty & Limitations Disclaimer (PRD §6.3) */}
        <div className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-slate-700">
              Certainty &amp; Limitations:{' '}
            </strong>
            {assessment.limitations}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
