import { Calendar, Clock } from 'lucide-react';
import { cn, formatDateShort, getDaysUntil } from '@/lib/utils';

interface DeadlineBadgeProps {
  deadline: string | null;
  className?: string;
}

export function DeadlineBadge({ deadline, className }: DeadlineBadgeProps) {
  const days = getDaysUntil(deadline);
  const formatted = formatDateShort(deadline);

  if (!deadline || days === null) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-slate-500', className)}>
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Rolling / Open</span>
      </span>
    );
  }

  if (days < 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 tabular-nums',
          className
        )}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span>Closed ({formatted})</span>
      </span>
    );
  }

  if (days <= 10) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 tabular-nums',
          className
        )}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span>
          Due in {days}d ({formatted})
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-slate-600 tabular-nums',
        className
      )}
    >
      <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      <span>Due {formatted}</span>
    </span>
  );
}

