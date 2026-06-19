export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface ApiCall {
  timestamp: string;
  model: string;
  usage: TokenUsage;
}

export interface ModelBreakdown {
  [model: string]: TokenUsage;
}

export interface SessionData {
  start_time: string;
  usage: TokenUsage;
  model_breakdown: ModelBreakdown;
  recent_calls: ApiCall[];
  call_count: number;
}

export interface UsageData {
  all_time: TokenUsage;
  all_time_model_breakdown: ModelBreakdown;
  all_time_call_count: number;
  session: SessionData;
}

export const EMPTY_USAGE: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
};
