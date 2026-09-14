export type Access = {
  email?: string;
  mode: "complimentary" | "sandbox";
  version: number;
  allowed: boolean;
  reason: string;
  billing_type?: "free" | "stripe" | null;
  payment_status?: string;
  paid_through?: string | null;
  payment_issue?: string | null;
  status: string;
  observed_at: string | null;
  period_start: string | null;
  period_end: string | null;
  access_until: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  plan: {
    id: number;
    name: string;
    configuration: {
      max_papers_per_run: number;
      schedule_frequencies: string[];
      email_delivery: boolean;
    };
  } | null;
  remaining: {
    runs: number | null;
    manual_runs: number | null;
    papers: number | null;
    digests: number | null;
  };
  usage: {
    completed_runs: number;
    reserved_runs: number;
    completed_papers: number;
    reserved_papers: number;
  };
  history?: {
    version: number;
    mode: string;
    created_at: string;
    change_note: string;
  }[];
};

export type BillingStatus = {
  cancel_allowed?: boolean;
  cancel_at_period_end?: boolean;
  period_end?: string | null;
  checkout_allowed: boolean;
  resume_allowed: boolean;
  portal_allowed: boolean;
  reason: string;
  attempt: {
    plan_name: string;
    code: string;
    revision: number;
    interval: string;
    checkout_status: string;
    subscription_status: string | null;
  } | null;
};

export type Digest = { id: string; topic: string };
export type ChangeOption = {
  code: string;
  revision: number;
  name: string;
  interval: string;
  price: string;
  currency: string;
  max_digests: number;
  max_papers_per_run: number;
  runs_per_month: number;
  manual_runs_per_month: number;
  papers_per_month: number;
  schedule_frequencies: string[];
  email_delivery: boolean;
};
export type Change = {
  id: string;
  state: string;
  plan_name: string;
  interval: string;
  price: string;
  currency: string;
  effective_at: string;
  error: string | null;
  undo_allowed: boolean;
  retry_allowed: boolean;
};
export type ChangeData = {
  items: ChangeOption[];
  change: Change | null;
  digests: Digest[];
  effective_at?: string;
  reason: string;
};
export type ActiveDigests = {
  available: boolean;
  items: Digest[];
  selected_ids: string[];
  limit: number;
};
export type Notice = {
  id: string;
  subject: string;
  text: string;
  email_status: string;
  created_at: string;
};

export type UpgradeOption = {
  code: string;
  revision: number;
  name: string;
  interval: string;
  currency: string;
  price: string;
};
export type Upgrade = {
  id: string;
  state: string;
  plan_name: string;
  interval: string;
  recurring_price: string;
  currency: string;
  amount_due: number;
  credit: number;
  charge: number;
  proration_at: string;
  period_end: string;
  expires_at: string;
  pending_until: string | null;
  error: string | null;
  confirm_allowed: boolean;
  retry_allowed: boolean;
  payment_allowed: boolean;
  limits: {
    max_digests: number;
    runs_per_month: number;
    manual_runs_per_month: number;
    papers_per_month: number;
    max_papers_per_run: number;
    schedule_frequencies: string[];
    email_delivery: boolean;
  };
};
export type UpgradeData = {
  items: UpgradeOption[];
  upgrade: Upgrade | null;
  reason: string;
};

export type FreeChoices = {
  available: boolean;
  effective: boolean;
  limit: number;
  selected_ids: string[];
  items: { id: string; topic: string; schedule_paused: boolean }[];
};

export type PublicPlan = {
  billing_type: "stripe" | "free";
  code: string;
  revision: number;
  name: string;
  description: string;
  currency: string;
  monthly_price: string;
  annual_price: string | null;
  max_digests: number;
  max_papers_per_run: number;
  papers_per_month: number;
  runs_per_month: number;
  manual_runs_per_month: number;
  schedule_frequencies: string[];
  email_delivery: boolean;
};
