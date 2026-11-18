import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ message = 'Loading career intelligence data...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-12 text-center"
    >
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      <p className="mt-3 text-sm font-medium text-slate-700">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load resource',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-rose-200 bg-rose-50/50 p-10 text-center"
    >
      <AlertCircle className="h-7 w-7 text-rose-600" />
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-600">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Retry request
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-600 leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

