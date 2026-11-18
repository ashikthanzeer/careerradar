import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecommendationMatch } from '@/types/domain';

interface MatchBadgeProps {
  recommendation: RecommendationMatch;
  compact?: boolean;
  className?: string;
}

export function MatchBadge({
  recommendation,
  compact = false,
  className,
}: MatchBadgeProps) {
  const { compositeScore, matchTier } = recommendation;

  const tierStyles: Record<RecommendationMatch['matchTier'], string> = {
    strong_alignment: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    moderate_alignment: 'bg-slate-100 text-slate-800 border-slate-300',
    partial_alignment: 'bg-slate-100 text-slate-600 border-slate-200',
    low_alignment: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  const tierLabels: Record<RecommendationMatch['matchTier'], string> = {
    strong_alignment: 'Strong Profile Fit',
    moderate_alignment: 'Moderate Fit',
    partial_alignment: 'Partial Fit',
    low_alignment: 'Exploratory Fit',
  };

  return (
    <span
      title="Weighted profile alignment index (Required skills 40%, Role 20%, Domain 15%, Breadth 15%, Logistics 10%). Not a selection probability."
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium tabular-nums',
        tierStyles[matchTier],
        className
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {compact ? `${compositeScore}% Fit` : `${tierLabels[matchTier]} (${compositeScore}%)`}
      </span>
    </span>
  );
}

