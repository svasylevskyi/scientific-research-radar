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
