import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-slate-900 text-white hover:bg-slate-800 border border-slate-900 dark:bg-indigo-600 dark:border-indigo-500 dark:hover:bg-indigo-500 shadow-sm disabled:opacity-50',
      secondary:
        'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 shadow-sm disabled:opacity-50',
      outline:
        'bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white shadow-sm disabled:opacity-50',
      ghost:
        'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white border border-transparent disabled:opacity-50',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 border border-rose-600 shadow-sm disabled:opacity-50',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'px-2.5 py-1.5 text-xs font-medium rounded-md gap-1.5',
      md: 'px-3.5 py-2 text-sm font-medium rounded-md gap-2',
      lg: 'px-5 py-2.5 text-sm font-semibold rounded-md gap-2',
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center transition-colors select-none disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
