import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, Code2, HelpCircle, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MatchBadge } from '@/components/shared/MatchBadge';
import type { RecommendationMatch, SkillGapAnalysis } from '@/types/domain';

interface SkillGapPanelProps {
  skillGap: SkillGapAnalysis;
  recommendation: RecommendationMatch;
}

export function SkillGapPanel({ skillGap, recommendation }: SkillGapPanelProps) {
  const unverifiedGaps = skillGap.items.filter((i) => i.status === 'unverified_gap');

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Profile Compatibility &amp; Skill-Gap Analysis
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Explainable weighted alignment comparing role requirements against your explicit skills and project history
          </p>
        </div>
        <MatchBadge recommendation={recommendation} />
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Coverage Bar Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Required Skill Coverage
              </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {skillGap.requiredCoveragePercent}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${skillGap.requiredCoveragePercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {skillGap.explicitMatchedSkills.length} explicit +{' '}
              {skillGap.inferredMatchedSkills.length} inferred skills matched
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Composite Alignment Index
              </span>
              <span className="font-mono font-bold text-indigo-700 tabular-nums">
                {recommendation.compositeScore} / 100
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${recommendation.compositeScore}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Relative alignment index (not an admissions probability)
            </p>
          </div>
        </div>

        {/* Weighted Factor Breakdown Table */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
            Explainable Factor Breakdown
          </h3>
          <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {recommendation.factorBreakdown.map((f) => (
              <div
                key={f.factor}
                className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{f.factor}</span>
                  <span className="ml-2 text-slate-400 font-mono">
                    (weight: {f.weightPercent}%)
                  </span>
                  <p className="text-slate-600 mt-0.5">{f.explanation}</p>
                </div>
                <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
                  {f.scorePercent}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Categorized Skills: Explicit vs Inferred vs Unverified Gaps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Explicitly Declared ({skillGap.explicitMatchedSkills.length})</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Directly listed in your Career Profile skill matrix.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {skillGap.explicitMatchedSkills.length === 0 ? (
                <span className="text-xs text-slate-400">None matched</span>
              ) : (
                skillGap.explicitMatchedSkills.map((s) => (
                  <Badge key={s} variant="emerald" className="font-mono">
                    {s}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-indigo-200 bg-indigo-50/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
              <Code2 className="h-4 w-4 text-indigo-600" />
              <span>Inferred from Projects ({skillGap.inferredMatchedSkills.length})</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Detected in your project descriptions or stack tags.
            </p>
            <div className="mt-2.5 space-y-1.5">
              {skillGap.inferredMatchedSkills.length === 0 ? (
                <span className="text-xs text-slate-400">None inferred</span>
              ) : (
                skillGap.inferredMatchedSkills.map((item) => (
                  <div key={item.skillName} className="text-xs">
                    <Badge variant="indigo" className="font-mono">
                      {item.skillName}
                    </Badge>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      via {item.inferredFrom}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
              <HelpCircle className="h-4 w-4 text-amber-600" />
              <span>Unverified / Missing ({unverifiedGaps.length})</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Not currently recorded on your profile.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {unverifiedGaps.length === 0 ? (
                <span className="text-xs text-emerald-700 font-medium">
                  Zero skill gaps identified!
                </span>
              ) : (
                unverifiedGaps.map((item) => (
                  <Badge key={item.skillName} variant="amber" className="font-mono">
                    {item.skillName} ({item.requirementType})
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Actionable Learning & Preparation Suggestions */}
        {unverifiedGaps.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Recommended Preparation &amp; Artifact Ideas
            </h3>
            <div className="space-y-2">
              {unverifiedGaps.map((gap) => (
                <div
                  key={gap.skillName}
                  className="flex items-start gap-2.5 rounded border border-slate-200 bg-slate-50 p-3 text-xs"
                >
                  <BookOpen className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-mono font-bold text-slate-900">
                      {gap.skillName}
                    </span>{' '}
                    <span className="text-slate-500">({gap.requirementType}):</span>{' '}
                    <span className="text-slate-700">{gap.learningSuggestion}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Caveat & Profile Link (PRD §6.6) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600">
          <span>{skillGap.caveat}</span>
          <Link
            to="/profile"
            className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Update Profile Skills</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

