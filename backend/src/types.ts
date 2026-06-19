export interface CallRecord {
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  method: string;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  callCount: number;
}

export interface SessionData {
  id: string;
  startTime: string;
  calls: CallRecord[];
  totals: Totals;
}

export interface UsageFile {
  apiKeyHash: string;
  sessions: SessionData[];
  allTimeTotals: Totals;
}

export const EMPTY_TOTALS: Totals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  callCount: 0,
};
