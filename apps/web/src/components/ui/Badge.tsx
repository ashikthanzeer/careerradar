import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'outline';
}

export function Badge({
  className,
  variant = 'neutral',
  children,
  ...props
}: BadgeProps) {
  const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    outline: 'bg-white text-slate-600 border-slate-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

