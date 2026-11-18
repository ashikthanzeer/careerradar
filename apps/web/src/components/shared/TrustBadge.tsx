import { ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle } from 'lucide-react';
import { TRUST_LABEL_META, cn } from '@/lib/utils';
import type { TrustLabel } from '@/types/domain';

interface TrustBadgeProps {
  label: TrustLabel;
  compact?: boolean;
  className?: string;
}

export function TrustBadge({ label, compact = false, className }: TrustBadgeProps) {
  const meta = TRUST_LABEL_META[label];

  const Icon =
    label === 'no_major_warnings'
      ? ShieldCheck
      : label === 'verification_required'
        ? AlertTriangle
        : label === 'elevated_risk'
          ? ShieldAlert
          : ShieldQuestion;

  return (
    <span
      title={meta.description}
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium',
        meta.badgeClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}

