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

export interface DigestRunSummary {
  id: string;
  digest_id: string;
  status: DigestRunStatus;
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
  search_data: Record<string, unknown>;
  relevance_data: Record<string, unknown>;
  summary_data: Record<string, unknown>;
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

export interface DigestRunDetail extends DigestRunSummary {
  digest_snapshot: Record<string, unknown>;
  history_context: Record<string, unknown>[];
  search_data: Record<string, unknown> | null;
  relevance_data: Record<string, unknown> | null;
  openai_response_id: string | null;
  paper_results: DigestRunPaper[];
  trend_analysis: {
    overview: string;
    data: Record<string, unknown>;
  } | null;
  briefing: {
    title: string;
    executive_summary: string;
    content_markdown: string;
    data: Record<string, unknown>;
  } | null;
}

export interface DigestRunListResponse {
  items: DigestRunSummary[];
  total: number;
  offset: number;
  limit: number;
}
