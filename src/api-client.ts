import * as http from 'http';
import * as vscode from 'vscode';

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

export interface SessionData {
  start_time: string;
  usage: TokenUsage;
  model_breakdown: { [model: string]: TokenUsage };
  recent_calls: ApiCall[];
  call_count: number;
}

export interface UsageData {
  all_time: TokenUsage;
  all_time_model_breakdown: { [model: string]: TokenUsage };
  all_time_call_count: number;
  session: SessionData;
}

function getBackendUrl(): string {
  return vscode.workspace.getConfiguration('tokenMeter').get<string>('backendUrl', 'http://localhost:3847');
}

function request(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const base = getBackendUrl();
    let hostname = 'localhost';
    let port = 3847;
    try {
      const u = new URL(base);
      hostname = u.hostname;
      port = parseInt(u.port, 10) || 3847;
    } catch { /* use defaults */ }

    const postData = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      { hostname, port, path, method, headers: { 'Content-Type': 'application/json' }, timeout: 3000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) { req.write(postData); }
    req.end();
  });
}

export async function checkStatus(): Promise<boolean> {
  try {
    await request('GET', '/api/status');
    return true;
  } catch {
    return false;
  }
}

export async function getUsage(): Promise<UsageData | null> {
  try {
    return (await request('GET', '/api/usage')) as UsageData;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionData | null> {
  try {
    return (await request('GET', '/api/session')) as SessionData;
  } catch {
    return null;
  }
}

export async function resetSession(): Promise<boolean> {
  try {
    await request('POST', '/api/reset');
    return true;
  } catch {
    return false;
  }
}
