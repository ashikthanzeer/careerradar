import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Compass,
  Edit3,
  ExternalLink,
  FileText,
  Trash2,
} from 'lucide-react';
import { useAllEnrichedOpportunities } from '@/hooks/useOpportunities';
import {
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
} from '@/hooks/useApplications';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateFeedback';
import { DeadlineBadge } from '@/components/shared/DeadlineBadge';
import { TrustBadge } from '@/components/shared/TrustBadge';
import { ApplicationEditModal } from './ApplicationEditModal';
import { APPLICATION_STATUS_META, formatDateShort } from '@/lib/utils';
import type { ApplicationRecord, ApplicationStatus } from '@/types/domain';

export function ApplicationsPage() {
  const {
    data: applications,
    isLoading: appsLoading,
    error: appsError,
    refetch,
  } = useApplications();
  const { data: opportunities, isLoading: oppsLoading } =
    useAllEnrichedOpportunities();

  const updateAppMutation = useUpdateApplication();
  const deleteAppMutation = useDeleteApplication();

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [editingApp, setEditingApp] = useState<ApplicationRecord | null>(null);

  if (appsLoading || oppsLoading) {
    return <LoadingState message="Loading application tracker pipeline..." />;
  }

  if (appsError || !applications) {
    return (
      <ErrorState
        message="Unable to load tracked applications."
        onRetry={() => refetch()}
      />
    );
  }

  const oppMap = new Map((opportunities ?? []).map((o) => [o.id, o]));

  const filteredApps = applications.filter((a) =>
    statusFilter === 'all' ? true : a.status === statusFilter
  );

  const countsByStatus = applications.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Application Tracker ({applications.length})
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your internship, fellowship, and research application stages, deadlines, next actions, and private notes.
          </p>
        </div>
        <Link to="/discover">
          <Button variant="primary" size="sm">
            <Compass className="h-4 w-4" />
            <span>Add Opportunity from Discovery</span>
          </Button>
        </Link>
      </div>

      {/* Stage Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === 'all'
              ? 'border-slate-900 dark:border-indigo-500 bg-slate-900 dark:bg-indigo-600 text-white'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          All Stages ({applications.length})
        </button>

        {(Object.keys(APPLICATION_STATUS_META) as ApplicationStatus[]).map((statusKey) => {
          const count = countsByStatus[statusKey] ?? 0;
          const meta = APPLICATION_STATUS_META[statusKey];
          const isActive = statusFilter === statusKey;
          return (
            <button
              key={statusKey}
              type="button"
              onClick={() => setStatusFilter(statusKey)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors tabular-nums ${
                isActive
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Application List */}
      {filteredApps.length === 0 ? (
        <EmptyState
          title={
            statusFilter === 'all'
              ? 'No applications tracked yet'
              : `No applications in "${APPLICATION_STATUS_META[statusFilter].label}" stage`
          }
          description="Track opportunities from the Discovery or Opportunity Detail pages to monitor deadlines, assessments, and interview notes."
          action={
            statusFilter !== 'all' ? (
              <Button variant="outline" size="sm" onClick={() => setStatusFilter('all')}>
                Show All Tracked Applications
              </Button>
            ) : (
              <Link to="/discover">
                <Button variant="primary" size="sm">
                  Explore Opportunities
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredApps.map((app) => {
            const opp = oppMap.get(app.opportunityId);
            const statusMeta = APPLICATION_STATUS_META[app.status];

            return (
              <Card key={app.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      {opp && (
                        <TrustBadge
                          label={opp.trustAssessment.overallLabel}
                          compact
                        />
                      )}
                      <DeadlineBadge deadline={app.deadline ?? opp?.deadline ?? null} />
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      <Link
                        to={`/opportunities/${app.opportunityId}`}
                        className="hover:text-indigo-600"
                      >
                        {opp?.title ?? `Opportunity ${app.opportunityId}`}
                      </Link>
                    </h2>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {opp?.organization.name ?? 'Organization'}
                      </span>
                      {opp && <span>· {opp.location}</span>}
                      {app.appliedAt && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          Applied: {formatDateShort(app.appliedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Status Selector & Edit/Delete Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="w-44">
                      <Select
                        aria-label={`Change status for ${opp?.title ?? app.id}`}
                        value={app.status}
                        onChange={(e) =>
                          updateAppMutation.mutate({
                            applicationId: app.id,
                            patch: { status: e.target.value as ApplicationStatus },
                          })
                        }
                      >
                        {Object.entries(APPLICATION_STATUS_META).map(([key, meta]) => (
                          <option key={key} value={key}>
                            Stage: {meta.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingApp(app)}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Notes &amp; Dates</span>
                    </Button>

                    {opp && (
                      <a
                        href={opp.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Open external application portal"
                      >
                        <span>Portal</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAppMutation.mutate(app.id)}
                      aria-label={`Remove ${opp?.title ?? app.id} from tracker`}
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Next Action & Private Notes */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 block">
                      Next Action
                    </span>
                    <p className="mt-1 font-medium text-slate-900">
                      {app.nextAction || 'No next action set'}
                    </p>
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>Private Notes</span>
                    </span>
                    <p className="mt-1 text-slate-700 whitespace-pre-line">
                      {app.privateNotes || 'No private notes recorded yet.'}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ApplicationEditModal
        isOpen={Boolean(editingApp)}
        onClose={() => setEditingApp(null)}
        application={editingApp}
        opportunityTitle={
          editingApp
            ? oppMap.get(editingApp.opportunityId)?.title ?? editingApp.opportunityId
            : ''
        }
        onSave={async (applicationId, patch) => {
          await updateAppMutation.mutateAsync({ applicationId, patch });
        }}
        isSaving={updateAppMutation.isPending}
      />
    </div>
  );
}

