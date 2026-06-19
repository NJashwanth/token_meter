import * as http from 'http';
import * as vscode from 'vscode';

export interface CallRecord {
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  method: string;
}

export interface SessionUsage {
  id: string;
  startTime: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  callCount: number;
  recentCalls: CallRecord[];
}

export interface AllTimeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  callCount: number;
}

export interface UsageData {
  session: SessionUsage;
  allTime: AllTimeUsage;
}

export interface StatusResponse {
  status: string;
  isConfigured: boolean;
  backendUrl: string;
}

function getBackendUrl(): { hostname: string; port: number } {
  const base = vscode.workspace.getConfiguration('tokenMeter').get<string>('backendUrl', 'http://localhost:3847');
  try {
    const u = new URL(base);
    return { hostname: u.hostname, port: parseInt(u.port, 10) || 3847 };
  } catch {
    return { hostname: 'localhost', port: 3847 };
  }
}

function request(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = getBackendUrl();
    const postData = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      { hostname, port, path, method, headers: { 'Content-Type': 'application/json' }, timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error ?? `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch { reject(new Error('Invalid JSON')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) { req.write(postData); }
    req.end();
  });
}

export async function checkStatus(): Promise<StatusResponse | null> {
  try {
    return (await request('GET', '/api/status')) as StatusResponse;
  } catch {
    return null;
  }
}

export async function configureApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = (await request('POST', '/api/configure', { apiKey })) as { success: boolean };
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getUsage(): Promise<UsageData | null> {
  try {
    return (await request('GET', '/api/usage')) as UsageData;
  } catch {
    return null;
  }
}

export async function resetSession(): Promise<boolean> {
  try {
    await request('POST', '/api/reset-session');
    return true;
  } catch {
    return false;
  }
}
