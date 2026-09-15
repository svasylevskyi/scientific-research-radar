import type { ApiResponse } from "./api-contracts";
import type { components } from "./api.generated";

export type Access = ApiResponse<"/api/v1/subscription", "get">;
export type BillingStatus = ApiResponse<"/api/v1/subscription/billing", "get">;
export type Digest = components["schemas"]["DigestChoiceRead"];
export type ChangeOption = components["schemas"]["ChangeOptionRead"];
export type Change = components["schemas"]["ChangeRead"];
export type ChangeData = ApiResponse<"/api/v1/subscription/billing/changes", "get">;
export type ActiveDigests = ApiResponse<"/api/v1/subscription/billing/active-digests", "get">;
export type Notice = components["schemas"]["NotificationRead"];
export type UpgradeOption = components["schemas"]["UpgradeOptionRead"];
export type Upgrade = components["schemas"]["UpgradeRead"];
export type UpgradeData = ApiResponse<"/api/v1/subscription/billing/upgrades", "get">;
export type FreeChoices = ApiResponse<"/api/v1/subscription/free-digests", "get">;
export type PublicPlan = components["schemas"]["PublicPlanRead"];
