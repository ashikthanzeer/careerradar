import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAllEnrichedOpportunities } from '@/hooks/useOpportunities';
import {
  useToggleSaveOpportunity,
  useUpsertApplication,
} from '@/hooks/useApplications';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateFeedback';
import { OpportunityCard } from '@/features/discovery/OpportunityCard';

export function SavedOpportunitiesPage() {
  const { data: opportunities, isLoading, error, refetch } = useAllEnrichedOpportunities();
  const toggleSaveMutation = useToggleSaveOpportunity();
  const upsertApplicationMutation = useUpsertApplication();

  if (isLoading) {
    return <LoadingState message="Loading saved opportunities..." />;
  }

  if (error || !opportunities) {
    return (
      <ErrorState
        message="Unable to load saved opportunities."
        onRetry={() => refetch()}
      />
    );
  }

  const savedItems = opportunities.filter((o) => o.isSaved);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Saved Opportunities ({savedItems.length})
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bookmarked opportunities for deeper credibility verification, skill preparation, or application tracking.
          </p>
        </div>
        <Link to="/discover">
          <Button variant="outline" size="sm">
            <Compass className="h-4 w-4" />
            <span>Discover More</span>
          </Button>
        </Link>
      </div>

      {savedItems.length === 0 ? (
        <EmptyState
          title="No saved opportunities yet"
          description="Bookmark internships, research fellowships, or open-source programmes while browsing Discovery to compare their requirements and deadlines here."
          action={
            <Link to="/discover">
              <Button variant="primary" size="sm">
                Browse Opportunity Discovery
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {savedItems.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              onToggleSave={(id) => toggleSaveMutation.mutate(id)}
              onQuickTrack={(id) =>
                upsertApplicationMutation.mutate({
                  opportunityId: id,
                  status: 'applied',
                  nextAction: 'Track submitted application status',
                })
              }
              isSaving={toggleSaveMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

