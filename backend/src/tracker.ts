import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UsageData, TokenUsage, ApiCall, EMPTY_USAGE } from './types';

const DATA_DIR = path.join(os.homedir(), '.token-meter');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const MAX_RECENT_CALLS = 10;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createEmptyUsageData(): UsageData {
  return {
    all_time: { ...EMPTY_USAGE },
    all_time_model_breakdown: {},
    all_time_call_count: 0,
    session: {
      start_time: new Date().toISOString(),
      usage: { ...EMPTY_USAGE },
      model_breakdown: {},
      recent_calls: [],
      call_count: 0,
    },
  };
}

function addTokens(target: TokenUsage, source: TokenUsage): void {
  target.input_tokens += source.input_tokens;
  target.output_tokens += source.output_tokens;
  target.cache_read_tokens += source.cache_read_tokens;
  target.cache_creation_tokens += source.cache_creation_tokens;
}

function addToModelBreakdown(
  breakdown: { [model: string]: TokenUsage },
  model: string,
  usage: TokenUsage
): void {
  if (!breakdown[model]) {
    breakdown[model] = { ...EMPTY_USAGE };
  }
  addTokens(breakdown[model], usage);
}

export class TokenTracker {
  private data: UsageData;

  constructor() {
    ensureDataDir();
    this.data = this.load();
    this.data.session = {
      start_time: new Date().toISOString(),
      usage: { ...EMPTY_USAGE },
      model_breakdown: {},
      recent_calls: [],
      call_count: 0,
    };
  }

  private load(): UsageData {
    try {
      if (fs.existsSync(USAGE_FILE)) {
        const raw = fs.readFileSync(USAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as UsageData;
        return {
          ...createEmptyUsageData(),
          all_time: parsed.all_time ?? { ...EMPTY_USAGE },
          all_time_model_breakdown: parsed.all_time_model_breakdown ?? {},
          all_time_call_count: parsed.all_time_call_count ?? 0,
        };
      }
    } catch {
      // Corrupted file — start fresh
    }
    return createEmptyUsageData();
  }

  private save(): void {
    ensureDataDir();
    fs.writeFileSync(USAGE_FILE, JSON.stringify(this.data, null, 2));
  }

  recordUsage(model: string, usage: TokenUsage): void {
    const call: ApiCall = {
      timestamp: new Date().toISOString(),
      model,
      usage,
    };

    addTokens(this.data.session.usage, usage);
    addToModelBreakdown(this.data.session.model_breakdown, model, usage);
    this.data.session.call_count++;
    this.data.session.recent_calls.push(call);
    if (this.data.session.recent_calls.length > MAX_RECENT_CALLS) {
      this.data.session.recent_calls.shift();
    }

    addTokens(this.data.all_time, usage);
    addToModelBreakdown(this.data.all_time_model_breakdown, model, usage);
    this.data.all_time_call_count++;

    this.save();
  }

  getUsage(): UsageData {
    return this.data;
  }

  getSession() {
    return this.data.session;
  }

  resetSession(): void {
    this.data.session = {
      start_time: new Date().toISOString(),
      usage: { ...EMPTY_USAGE },
      model_breakdown: {},
      recent_calls: [],
      call_count: 0,
    };
    this.save();
  }
}
