export type TargetAudience =
  | "researchers"
  | "builders_technical_teams"
  | "science_communicators_educators"
  | "executives_decision_makers"
  | "general";

export type DigestFrequency = "daily" | "weekly" | "monthly" | "quarterly";

export interface DigestInput {
  topic: string;
  description: string | null;
  include_keywords: string[];
  exclude_keywords: string[];
  target_audience: TargetAudience[];
  reporting_from: string;
  reporting_to: string;
  frequency: DigestFrequency;
  maximum_papers: number;
}

export type DigestUpdateInput = Partial<DigestInput>;

export interface Digest extends DigestInput {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface DigestOwner {
  id: string;
  full_name: string;
  email: string;
}

export interface AdminDigest extends Digest {
  owner: DigestOwner;
}

export interface DigestListResponse<TDigest extends Digest = Digest> {
  items: TDigest[];
  total: number;
  offset: number;
  limit: number;
}

export type DigestRunStatus = "running" | "completed" | "failed";
export type DigestRunTrigger = "manual" | "scheduled";
export type DigestRunStageType =
  | "discovery_relevance"
  | "paper_summaries"
  | "trend_analysis"
  | "digest_briefing";
export type DigestRunStageStatus = "pending" | "running" | "completed" | "failed";
export type Confidence = "low" | "medium" | "high";
export type Priority = "low" | "medium" | "high";

export interface SourceCitation {
  title: string;
  url: string;
}

export interface DigestRunSearchData {
  queries: string[];
  sources_used: string[];
  deduplication_notes: string[];
  coverage_notes: string[];
  next_step_recommendations: string[];
}

export interface PaperSearchData {
  updated_date: string | null;
  venue_or_source: string | null;
  pdf_url: string | null;
  access_status: "open" | "paywalled" | "metadata_only" | "user_provided" | "unknown";
  license: string | null;
  full_text_available: boolean;
  discovery_reason: string;
  matched_keywords: string[];
  possible_duplicate_of: string | null;
  factual_note: string;
  warnings: string[];
  citations: SourceCitation[];
}

export interface DigestRunRelevanceData {
  methodology: string;
  recommendations: string[];
  quality_warnings: string[];
}

export interface PaperRelevanceData {
  topic_relevance_score: number;
  novelty_signal_score: number;
  practical_value_score: number;
  confidence_score: number;
  recommended_status: "summarize" | "mention_briefly" | "archive" | "reject";
  best_digest_placement:
    | "top_paper"
    | "important_technical_contribution"
    | "trend_signal"
    | "background_context"
    | "niche_interest"
    | "archive_only"
    | "reject";
  rationale: string;
  criteria: string[];
  evidence_used: string[];
  potential_value_for_audience: string;
  caveats: string[];
  next_step_recommendations: string[];
}

export interface PaperSummaryData {
  summary_basis:
    | "metadata_only"
    | "abstract_only"
    | "extracted_sections"
    | "open_full_text"
    | "user_provided_source"
    | "unclear";
  paper_type:
    | "empirical_study"
    | "benchmark_paper"
    | "dataset_paper"
    | "survey_review"
    | "theoretical_paper"
    | "systems_paper"
    | "methods_paper"
    | "position_paper"
    | "case_study"
    | "unclear";
  concise_summary: string;
  why_this_paper_matters: string[];
  methods: string[];
  key_findings: string[];
  limitations: string[];
  implications: string[];
  recommendations: string[];
  suggested_digest_bullet: string;
  follow_up_questions: string[];
  related_search_terms: string[];
  warnings: string[];
  confidence_score: number;
}

export interface TrendTheme {
  title: string;
  summary: string;
  evidence_type: "multi_paper_pattern" | "single_paper_signal" | "historical_continuation" | "weak_signal";
  evidence_external_ids: string[];
  observed_pattern: string;
  interpretation: string;
  confidence: Confidence;
  relevance_to_audience: string;
  caveats: string[];
}

export interface EmergingItem {
  name: string;
  item_type: "method" | "model" | "tool" | "dataset" | "benchmark" | "framework" | "metric" | "system" | "other";
  description: string;
  supporting_external_ids: string[];
  why_it_matters: string;
  maturity_level: "early" | "emerging" | "established" | "unclear";
  confidence: Confidence;
  caveats: string[];
}

export interface RepeatedProblem {
  name: string;
  description: string;
  supporting_external_ids: string[];
  affected_methods_or_topics: string[];
  why_it_matters: string;
  confidence: Confidence;
}

export interface CompetingApproach {
  description: string;
  approach_a: string;
  approach_b: string;
  supporting_external_ids: string[];
  interpretation: string;
  confidence: Confidence;
  caveats: string[];
}

export interface WeakSignal {
  name: string;
  description: string;
  supporting_external_ids: string[];
  why_it_may_matter: string;
  why_confidence_is_limited: string;
  recommended_monitoring_query: string;
}

export interface HistoricalChange {
  change_type: "new_theme" | "repeated_theme" | "fading_theme" | "stronger_signal" | "weaker_signal" | "unclear";
  description: string;
  supporting_external_ids: string[];
  previous_digest_reference: string;
  confidence: Confidence;
}

export interface PracticalImplication {
  audience_segment: TargetAudience;
  implication: string;
  supporting_external_ids: string[];
  recommended_action: string;
  confidence: Confidence;
}

export interface RecommendedSearch {
  query: string;
  reason: string;
  priority: Priority;
}

export interface TrendAnalysisData {
  overall_confidence: Confidence;
  analysis_limitations: string[];
  themes: TrendTheme[];
  emerging_items: EmergingItem[];
  repeated_limitations_or_unresolved_problems: RepeatedProblem[];
  contradictions_or_competing_approaches: CompetingApproach[];
  weak_signals: WeakSignal[];
  changes_vs_previous_digest: HistoricalChange[];
  practical_implications: PracticalImplication[];
  recommendations: string[];
  recommended_next_searches: RecommendedSearch[];
}

export interface BriefingMainSignal {
  title: string;
  summary: string;
  why_it_matters: string;
  supporting_external_ids: string[];
  confidence: Confidence;
  caveats: string[];
}

export interface RecommendedAction {
  action: string;
  reason: string;
  priority: Priority;
  related_external_ids: string[];
}

export interface DigestBriefingData {
  highlights: string[];
  main_signal: BriefingMainSignal | null;
  top_paper_external_ids: string[];
  secondary_paper_external_ids: string[];
  recommendations: RecommendedAction[];
  recommended_next_searches: RecommendedSearch[];
  source_basis: "metadata_only" | "abstracts_only" | "open_full_text" | "user_provided_sources" | "mixed" | "unclear";
  transparency_note: string;
  quality_warnings: string[];
}

export interface DigestRunSummary {
  id: string;
  digest_id: string;
  owner_id: string;
  status: DigestRunStatus;
  current_stage: DigestRunStageType | null;
  trigger: DigestRunTrigger;
  model_name: string;
  prompt_version: string;
  paper_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface DigestRunPaper {
  rank: number;
  relevance_score: number;
  search_data: PaperSearchData;
  relevance_data: PaperRelevanceData;
  summary_data: PaperSummaryData | null;
  paper: {
    id: string;
    source_name: string;
    external_id: string;
    title: string;
    authors: string[];
    abstract: string | null;
    published_date: string | null;
    url: string;
    doi: string | null;
  };
}

export interface DigestRunStage {
  stage: DigestRunStageType;
  position: number;
  status: DigestRunStageStatus;
  progress_current: number;
  progress_total: number;
  result_data: Record<string, unknown> | null;
  error_message: string | null;
  response_ids: string[];
  usage_data: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
  };
  model_name: string;
  prompt_version: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DigestRunDetail extends DigestRunSummary {
  digest_snapshot: Record<string, unknown>;
  history_context: Record<string, unknown>[];
  stages: DigestRunStage[];
  search_data: DigestRunSearchData | null;
  relevance_data: DigestRunRelevanceData | null;
  openai_response_id: string | null;
  paper_results: DigestRunPaper[];
  trend_analysis: {
    overview: string;
    data: TrendAnalysisData;
  } | null;
  briefing: {
    title: string;
    executive_summary: string;
    content_markdown: string;
    data: DigestBriefingData;
  } | null;
}

export interface DigestRunListResponse {
  items: DigestRunSummary[];
  total: number;
  offset: number;
  limit: number;
}
