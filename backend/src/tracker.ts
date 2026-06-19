import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { UsageFile, SessionData, CallRecord, Totals, EMPTY_TOTALS } from './types';

const DATA_DIR = path.join(os.homedir(), '.token-meter');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const MAX_RECENT_CALLS = 10;
const MAX_STORED_SESSIONS = 50;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '_');
  const seq = Math.floor(Math.random() * 1000);
  return `session_${date}_${seq}`;
}

function addToTotals(target: Totals, record: CallRecord): void {
  target.inputTokens += record.inputTokens;
  target.outputTokens += record.outputTokens;
  target.cacheCreationTokens += record.cacheCreationTokens;
  target.cacheReadTokens += record.cacheReadTokens;
  target.callCount++;
}

export class TokenTracker {
  private data: UsageFile;
  private currentSession: SessionData;
  private apiKey: string | null = null;

  constructor() {
    ensureDataDir();
    this.data = this.load();
    this.currentSession = this.createSession();
  }

  private load(): UsageFile {
    try {
      if (fs.existsSync(USAGE_FILE)) {
        const raw = fs.readFileSync(USAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as UsageFile;
        return {
          apiKeyHash: parsed.apiKeyHash ?? '',
          sessions: parsed.sessions ?? [],
          allTimeTotals: parsed.allTimeTotals ?? { ...EMPTY_TOTALS },
        };
      }
    } catch {
      // corrupted — start fresh
    }
    return { apiKeyHash: '', sessions: [], allTimeTotals: { ...EMPTY_TOTALS } };
  }

  private save(): void {
    ensureDataDir();
    const toSave: UsageFile = {
      ...this.data,
      sessions: [
        ...this.data.sessions.slice(-MAX_STORED_SESSIONS),
        { ...this.currentSession, calls: this.currentSession.calls.slice(-MAX_RECENT_CALLS) },
      ],
    };
    fs.writeFileSync(USAGE_FILE, JSON.stringify(toSave, null, 2));
  }

  private createSession(): SessionData {
    return {
      id: generateSessionId(),
      startTime: new Date().toISOString(),
      calls: [],
      totals: { ...EMPTY_TOTALS },
    };
  }

  configure(apiKey: string): void {
    this.apiKey = apiKey;
    this.data.apiKeyHash = hashKey(apiKey);
    this.save();
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  recordCall(record: CallRecord): void {
    this.currentSession.calls.push(record);
    if (this.currentSession.calls.length > MAX_RECENT_CALLS) {
      this.currentSession.calls.shift();
    }
    addToTotals(this.currentSession.totals, record);
    addToTotals(this.data.allTimeTotals, record);
    this.save();
  }

  getUsage() {
    return {
      session: {
        id: this.currentSession.id,
        startTime: this.currentSession.startTime,
        ...this.currentSession.totals,
        recentCalls: this.currentSession.calls.slice().reverse(),
      },
      allTime: { ...this.data.allTimeTotals },
    };
  }

  resetSession() {
    this.currentSession = this.createSession();
    this.save();
    return this.getUsage();
  }
}
