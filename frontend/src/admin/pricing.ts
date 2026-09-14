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
export type Price = Omit<
  PriceInput,
  "max_input_tokens" | "cache_write_per_million"
> & {
  cache_write_per_million?: string | null;
  max_input_tokens: number;
  id: number;
  created_at: string;
  is_current: boolean;
};
export type PriceList = { items: Price[]; total: number };
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
