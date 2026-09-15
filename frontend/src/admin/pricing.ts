import type { ApiResponse } from "../types/api-contracts";
export type PriceInput = {
  model_name: string;
  version: string;
  input_per_million: string;
  cached_input_per_million: string;
  cache_write_per_million: string;
  output_per_million: string;
  web_search_per_call: string;
  max_input_tokens: string;
};
export type Price = ApiResponse<"/api/v1/admin/pricing/{price_id}", "get">;
export type PriceList = ApiResponse<"/api/v1/admin/pricing", "get">;
export const blank: PriceInput = {
  model_name: "",
  version: "",
  input_per_million: "",
  cached_input_per_million: "",
  cache_write_per_million: "",
  output_per_million: "",
  web_search_per_call: "",
  max_input_tokens: "",
};
export const rates = [
  ["input_per_million", "Uncached input / million tokens"],
  ["cached_input_per_million", "Cached input / million tokens"],
  ["cache_write_per_million", "Cache writes / million tokens (optional)"],
  ["output_per_million", "Output / million tokens"],
  ["web_search_per_call", "Web search / call"],
] as const;
