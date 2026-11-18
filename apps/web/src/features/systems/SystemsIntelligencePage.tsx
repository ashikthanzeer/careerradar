import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  GitMerge,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { systemsService } from '@/services/systems.service';
import { OPPORTUNITY_QUERY_KEYS } from '@/hooks/useOpportunities';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/StateFeedback';
import type { IngestionRunReport } from '@/lib/systems-engine';

const SAMPLE_SEMANTIC_QUERIES = [
  'neural nets rag llm embeddings',
  'low latency linux kernel ebpf rust',
  'cloud native containers k8s telemetry',
  'ast static analysis sandbox security',
];

export function SystemsIntelligencePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ingestion' | 'hybrid_search' | 'ml_eval'>(
    'ingestion'
  );
  const [lastIngestionReport, setLastIngestionReport] =
    useState<IngestionRunReport | null>(null);
  const [semanticQuery, setSemanticQuery] = useState(SAMPLE_SEMANTIC_QUERIES[0]);
  const [alpha, setAlpha] = useState(0.45);

  const { data: freshnessData, isLoading: freshnessLoading } = useQuery({
    queryKey: ['systems', 'freshness'],
    queryFn: () => systemsService.getFreshnessStatus(),
  });

  const { data: hybridSearchData, isLoading: searchLoading } = useQuery({
    queryKey: ['systems', 'hybrid-search', semanticQuery, alpha],
    queryFn: () => systemsService.runHybridSearch(semanticQuery, alpha),
  });

  const { data: mlEvalData, isLoading: evalLoading } = useQuery({
    queryKey: ['systems', 'ml-evaluation'],
    queryFn: () => systemsService.getMlEvaluationReport(),
  });

  const ingestionMutation = useMutation({
    mutationFn: () => systemsService.runIngestionBatch(),
    onSuccess: (report) => {
      setLastIngestionReport(report);
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['systems', 'freshness'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <Cpu className="h-3.5 w-3.5" />
            <span>Phase 4 &amp; Phase 5 Systems Console</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Data Ingestion, Hybrid Retrieval &amp; ML Evaluation
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect compliant multi-source ingestion, normalization, deduplication, hybrid semantic search, and reproducible ML benchmarks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ingestion')}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'ingestion'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Phase 4: Ingestion &amp; Deduplication</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hybrid_search')}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'hybrid_search'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Phase 5: Hybrid Semantic Search</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ml_eval')}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'ml_eval'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Phase 5: ML Evaluation Pipeline</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PHASE 4 DATA INGESTION, NORMALIZATION & DEDUPLICATION */}
      {activeTab === 'ingestion' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Compliant Multi-Source Ingestion &amp; Deduplication Worker
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Normalizes company names (stripping legal suffixes), strips UTM tracking tags from URLs, merges cross-source duplicates, and preserves idempotency on repeated runs.
                </p>
              </div>
              <Button
                variant="primary"
                size="md"
                disabled={ingestionMutation.isPending}
                onClick={() => ingestionMutation.mutate()}
              >
                {ingestionMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Running Batch...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Run Compliant Feed Ingestion Batch</span>
                  </>
                )}
              </Button>
            </CardHeader>

            {lastIngestionReport && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Feed Records Processed
                    </span>
                    <p className="mt-1 text-xl font-bold font-mono text-slate-900">
                      {lastIngestionReport.totalProcessed}
                    </p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
                    <span className="text-[11px] font-semibold uppercase text-emerald-800">
                      New Opportunities Created
                    </span>
                    <p className="mt-1 text-xl font-bold font-mono text-emerald-900">
                      {lastIngestionReport.newOpportunitiesCreated}
                    </p>
                  </div>
                  <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <span className="text-[11px] font-semibold uppercase text-indigo-800">
                      Cross-Source Duplicates Merged
                    </span>
                    <p className="mt-1 text-xl font-bold font-mono text-indigo-900">
                      {lastIngestionReport.crossSourceDuplicatesMerged}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Idempotent Refreshes
                    </span>
                    <p className="mt-1 text-xl font-bold font-mono text-slate-900">
                      {lastIngestionReport.idempotentUpdates}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Batch Normalization &amp; Deduplication Audit Log (
                    {lastIngestionReport.batchId})
                  </h3>
                  {lastIngestionReport.outcomes.map((out) => (
                    <div
                      key={out.externalId}
                      className="rounded-md border border-slate-200 bg-white p-3.5 text-xs space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GitMerge className="h-4 w-4 text-indigo-600" />
                          <span className="font-bold text-slate-900">
                            {out.rawTitle}
                          </span>
                          <span className="text-slate-500">
                            ({out.rawOrganization})
                          </span>
                        </div>
                        <Badge
                          variant={
                            out.action === 'created_new'
                              ? 'emerald'
                              : out.action === 'duplicate_merged'
                                ? 'indigo'
                                : 'neutral'
                          }
                        >
                          {out.action.toUpperCase().replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        <div>
                          <strong>Normalized Org:</strong> {out.normalizedOrganization}
                        </div>
                        <div>
                          <strong>Normalized Title:</strong> {out.normalizedTitle}
                        </div>
                        <div className="truncate">
                          <strong>Canonical URL:</strong> {out.canonicalUrl}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-600">{out.reason}</span>
                        <Link
                          to={`/opportunities/${out.opportunityId}`}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline shrink-0"
                        >
                          <span>Inspect {out.opportunityId}</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Freshness & Provenance Monitor */}
          {freshnessLoading || !freshnessData ? (
            <LoadingState message="Inspecting source provenance and freshness timestamps..." />
          ) : (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Opportunity Freshness &amp; Source Provenance Monitor
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Tracks discovery timestamps, last-checked timestamps, and deadline windows. Per PRD §11, failed HTTP checks mark a listing for re-verification rather than assuming it is closed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="emerald">
                    Fresh: {freshnessData.freshnessSummary.fresh}
                  </Badge>
                  <Badge variant="amber">
                    Closing Soon: {freshnessData.freshnessSummary.closingSoon}
                  </Badge>
                  <Badge variant="neutral">
                    Sources Tracked: {freshnessData.totalProvenanceSources}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-slate-200">
                {freshnessData.records.map((rec) => (
                  <div
                    key={rec.opportunityId}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/opportunities/${rec.opportunityId}`}
                          className="font-bold text-slate-900 hover:text-indigo-600"
                        >
                          {rec.title}
                        </Link>
                        <Badge variant="outline">{rec.organizationName}</Badge>
                      </div>
                      <p className="mt-1 text-slate-600">{rec.explanation}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          rec.freshnessState === 'fresh'
                            ? 'emerald'
                            : rec.freshnessState === 'closing_soon'
                              ? 'amber'
                              : 'neutral'
                        }
                      >
                        {rec.freshnessState.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <span className="font-mono text-[11px] text-slate-500">
                        {rec.sourceCount} source(s)
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: PHASE 5 HYBRID SEMANTIC + LEXICAL SEARCH */}
      {activeTab === 'hybrid_search' && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Phase 5 Hybrid Semantic + Lexical Retrieval Engine
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Combines sublinear TF-IDF lexical similarity (weight α = {alpha}) with dense concept-cluster &amp; character n-gram semantic similarity (weight 1 - α = {(1 - alpha).toFixed(2)}).
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="alpha-slider" className="font-semibold text-slate-700">
                  Lexical α ({alpha}):
                </label>
                <input
                  id="alpha-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={alpha}
                  onChange={(e) => setAlpha(Number(e.target.value))}
                  className="w-28 accent-indigo-600"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="search"
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
                placeholder="Enter a semantic or technical concept query..."
                aria-label="Hybrid semantic search query"
                className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">
                Sample semantic queries:
              </span>
              {SAMPLE_SEMANTIC_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setSemanticQuery(q)}
                  className={`rounded border px-2.5 py-1 font-mono transition-colors ${
                    semanticQuery === q
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </Card>

          {searchLoading || !hybridSearchData ? (
            <LoadingState message="Computing lexical TF-IDF and semantic concept vectors..." />
          ) : (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  Detected Query Concept Clusters:{' '}
                  {hybridSearchData.queryConceptClusters.length > 0 ? (
                    hybridSearchData.queryConceptClusters.map((c) => (
                      <Badge key={c} variant="indigo" className="ml-1.5 font-mono">
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <span className="font-mono text-slate-500">lexical-only</span>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-500">
                  Evaluated {hybridSearchData.totalEvaluated} verified opportunities
                </span>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-slate-200">
                {hybridSearchData.results.map((item, idx) => (
                  <div
                    key={item.opportunityId}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600">
                          #{idx + 1}
                        </span>
                        <Link
                          to={`/opportunities/${item.opportunityId}`}
                          className="text-sm font-bold text-slate-900 hover:text-indigo-600"
                        >
                          {item.title}
                        </Link>
                        <Badge variant="outline">{item.organizationName}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {item.skills.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-700"
                          >
                            {s}
                          </span>
                        ))}
                        {item.matchedConceptClusters.map((mc) => (
                          <Badge key={mc} variant="emerald" className="font-mono">
                            concept:{mc}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                      <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center">
                        <span className="block text-[10px] text-slate-500">
                          Lexical
                        </span>
                        <span className="font-semibold text-slate-800">
                          {(item.lexicalScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center">
                        <span className="block text-[10px] text-slate-500">
                          Semantic
                        </span>
                        <span className="font-semibold text-indigo-600">
                          {(item.semanticScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-center">
                        <span className="block text-[10px] text-indigo-800">
                          Hybrid Score
                        </span>
                        <span className="font-bold text-indigo-900">
                          {(item.hybridScore * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: PHASE 5 REPRODUCIBLE ML EVALUATION PIPELINE */}
      {activeTab === 'ml_eval' && (
        <div className="space-y-6">
          {evalLoading || !mlEvalData ? (
            <LoadingState message="Executing reproducible Phase 5 ML evaluation suite (SEED = 42)..." />
          ) : (
            <>
              {/* Reproducibility & Featurization Hygiene Banner */}
              <Card className="p-5 border-indigo-200 bg-indigo-50/30">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">
                        Reproducibility &amp; Strict Featurization Hygiene
                      </h2>
                      <Badge variant="indigo" className="font-mono">
                        SEED = {mlEvalData.reproducibilityMetadata.randomSeed}
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {mlEvalData.reproducibilityMetadata.datasetVersion}
                      </Badge>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      <strong>Train/Test Isolation:</strong>{' '}
                      {mlEvalData.reproducibilityMetadata.featurizationOrdering}
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      <strong>NULL / Missing-Value Strategy:</strong>{' '}
                      {mlEvalData.reproducibilityMetadata.missingValueStrategy}
                    </p>
                  </div>
                </div>
              </Card>

              {/* 1. Recommendation Ranking Evaluation (Baseline vs. Learning-to-Rank) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      1. Recommendation Ranking Evaluation (Precision@K, Recall@K, NDCG@K)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compares the Phase 3 Heuristic Weighted Scorer against the Phase 5 Calibrated Pairwise Learning-to-Rank (LTR) model.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2.5 pr-4 font-semibold">Model Variant</th>
                          <th className="py-2.5 px-3 font-semibold font-mono">
                            Precision@3
                          </th>
                          <th className="py-2.5 px-3 font-semibold font-mono">
                            Recall@3
                          </th>
                          <th className="py-2.5 px-3 font-semibold font-mono">
                            NDCG@3
                          </th>
                          <th className="py-2.5 px-3 font-semibold font-mono">
                            Precision@5
                          </th>
                          <th className="py-2.5 px-3 font-semibold font-mono">
                            Recall@5
                          </th>
                          <th className="py-2.5 pl-3 font-semibold font-mono">
                            NDCG@5
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        <tr>
                          <td className="py-3 pr-4 font-sans font-medium text-slate-700">
                            {
                              mlEvalData.recommendationEvaluation.baselineWeightedModel
                                .modelName
                            }
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation.baselineWeightedModel
                                .precisionAt3 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation.baselineWeightedModel
                                .recallAt3 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {mlEvalData.recommendationEvaluation.baselineWeightedModel.ndcgAt3.toFixed(
                              4
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation.baselineWeightedModel
                                .precisionAt5 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation.baselineWeightedModel
                                .recallAt5 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 pl-3">
                            {mlEvalData.recommendationEvaluation.baselineWeightedModel.ndcgAt5.toFixed(
                              4
                            )}
                          </td>
                        </tr>
                        <tr className="bg-emerald-50/30 font-semibold text-emerald-900">
                          <td className="py-3 pr-4 font-sans font-bold">
                            {
                              mlEvalData.recommendationEvaluation
                                .phase5LearningToRankModel.modelName
                            }
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation
                                .phase5LearningToRankModel.precisionAt3 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation
                                .phase5LearningToRankModel.recallAt3 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {mlEvalData.recommendationEvaluation.phase5LearningToRankModel.ndcgAt3.toFixed(
                              4
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation
                                .phase5LearningToRankModel.precisionAt5 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 px-3">
                            {(
                              mlEvalData.recommendationEvaluation
                                .phase5LearningToRankModel.recallAt5 * 100
                            ).toFixed(1)}
                            %
                          </td>
                          <td className="py-3 pl-3">
                            {mlEvalData.recommendationEvaluation.phase5LearningToRankModel.ndcgAt5.toFixed(
                              4
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* 2. Scam Classification & Calibration + 3. Structured Extraction */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      <h2 className="text-base font-bold text-slate-900">
                        2. Trust &amp; Scam Classifier Evaluation
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {mlEvalData.trustClassificationEvaluation.modelName} (Train:{' '}
                      {mlEvalData.trustClassificationEvaluation.trainSplitSize}, Held-Out Test:{' '}
                      {mlEvalData.trustClassificationEvaluation.testSplitSize})
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div className="grid grid-cols-3 gap-3 font-mono">
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          Precision / Recall
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {(
                            mlEvalData.trustClassificationEvaluation.precision * 100
                          ).toFixed(0)}
                          % /{' '}
                          {(
                            mlEvalData.trustClassificationEvaluation.recall * 100
                          ).toFixed(0)}
                          %
                        </span>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          FPR / FNR
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {(
                            mlEvalData.trustClassificationEvaluation
                              .falsePositiveRate * 100
                          ).toFixed(1)}
                          % /{' '}
                          {(
                            mlEvalData.trustClassificationEvaluation
                              .falseNegativeRate * 100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          Brier Calibration
                        </span>
                        <span className="text-sm font-bold text-emerald-700">
                          {mlEvalData.trustClassificationEvaluation.brierCalibrationScore.toFixed(
                            4
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="rounded border border-slate-200 p-3 font-mono">
                      <span className="text-[11px] font-sans font-semibold uppercase text-slate-500 block mb-2">
                        Held-Out Test Confusion Matrix
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
                          True Positives (Risk Caught):{' '}
                          <strong>
                            {
                              mlEvalData.trustClassificationEvaluation.confusionMatrix
                                .truePositives
                            }
                          </strong>
                        </div>
                        <div className="rounded bg-slate-50 border border-slate-200 p-2">
                          False Positives:{' '}
                          <strong>
                            {
                              mlEvalData.trustClassificationEvaluation.confusionMatrix
                                .falsePositives
                            }
                          </strong>
                        </div>
                        <div className="rounded bg-slate-50 border border-slate-200 p-2">
                          False Negatives:{' '}
                          <strong>
                            {
                              mlEvalData.trustClassificationEvaluation.confusionMatrix
                                .falseNegatives
                            }
                          </strong>
                        </div>
                        <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
                          True Negatives (Legit Clear):{' '}
                          <strong>
                            {
                              mlEvalData.trustClassificationEvaluation.confusionMatrix
                                .trueNegatives
                            }
                          </strong>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {mlEvalData.trustClassificationEvaluation.governanceNote}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                      <h2 className="text-base font-bold text-slate-900">
                        3. Structured Information Extraction Accuracy
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {mlEvalData.extractionEvaluation.modelName} · Evaluated across{' '}
                      {mlEvalData.extractionEvaluation.benchmarkSize} annotated listings
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div className="grid grid-cols-3 gap-3 font-mono">
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          Skill Precision
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {(
                            mlEvalData.extractionEvaluation.skillExtractionPrecision *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          Skill Recall
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {(
                            mlEvalData.extractionEvaluation.skillExtractionRecall * 100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] text-slate-500 block">
                          Skill F1 Score
                        </span>
                        <span className="text-sm font-bold text-indigo-600">
                          {(
                            mlEvalData.extractionEvaluation.skillExtractionF1 * 100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase text-slate-500 block">
                        Field-Level Schema Extraction Accuracy
                      </span>
                      {Object.entries(
                        mlEvalData.extractionEvaluation.fieldLevelAccuracy
                      ).map(([field, acc]) => (
                        <div
                          key={field}
                          className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <span className="font-medium capitalize text-slate-800">
                            {field.replace(/([A-Z])/g, ' $1')}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {(acc * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

