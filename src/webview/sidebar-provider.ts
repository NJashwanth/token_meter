import * as vscode from 'vscode';
import { UsageData } from '../api-client';

const MODEL_COSTS: { [prefix: string]: { input: number; output: number; cache_read: number; cache_write: number } } = {
  'claude-opus': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
  'claude-sonnet': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-haiku': { input: 0.8, output: 4, cache_read: 0.08, cache_write: 1 },
  'claude-fable': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'default': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
};

function getCostRate(model: string) {
  for (const prefix of Object.keys(MODEL_COSTS)) {
    if (prefix !== 'default' && model.startsWith(prefix)) {
      return MODEL_COSTS[prefix];
    }
  }
  return MODEL_COSTS['default'];
}

function estimateCost(usage: UsageData['session']['usage'], model?: string): number {
  const rate = getCostRate(model ?? 'default');
  return (
    (usage.input_tokens / 1_000_000) * rate.input +
    (usage.output_tokens / 1_000_000) * rate.output +
    (usage.cache_read_tokens / 1_000_000) * rate.cache_read +
    (usage.cache_creation_tokens / 1_000_000) * rate.cache_write
  );
}

function estimateCostByModel(data: UsageData, scope: 'session' | 'all_time'): number {
  const breakdown = scope === 'session' ? data.session.model_breakdown : data.all_time_model_breakdown;
  let total = 0;
  for (const [model, usage] of Object.entries(breakdown)) {
    total += estimateCost(usage, model);
  }
  return total;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokenMeter.sidebar';
  private _view?: vscode.WebviewView;
  private _lastData?: UsageData;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'reset') {
        vscode.commands.executeCommand('tokenMeter.resetSession');
      }
    });
    this._renderHtml();
  }

  update(data: UsageData): void {
    this._lastData = data;
    if (this._view) {
      this._view.webview.postMessage({ type: 'update', data, costs: { session: estimateCostByModel(data, 'session'), allTime: estimateCostByModel(data, 'all_time') } });
    }
  }

  setDisconnected(): void {
    this._lastData = undefined;
    if (this._view) {
      this._view.webview.postMessage({ type: 'disconnected' });
    }
  }

  private _renderHtml(): void {
    if (!this._view) { return; }
    this._view.webview.html = getWebviewHtml();
  }
}

function getWebviewHtml(): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-sideBar-foreground);
    --border: var(--vscode-panel-border);
    --accent: var(--vscode-textLink-foreground);
    --muted: var(--vscode-descriptionForeground);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --input-bg: var(--vscode-input-background);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --warning: var(--vscode-editorWarning-foreground);
    --error: var(--vscode-editorError-foreground);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--fg); background: var(--bg); padding: 12px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 8px; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .stat-card { background: var(--input-bg); border-radius: 4px; padding: 8px 10px; }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.3px; }
  .stat-value { font-size: 16px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .stat-value.input { color: #4da6ff; }
  .stat-value.output { color: #f0883e; }
  .stat-value.cache-read { color: #7ee787; }
  .stat-value.cache-write { color: #d2a8ff; }
  .cost-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .cost-row .label { color: var(--muted); }
  .cost-row .value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .activity-item { font-size: 11px; padding: 5px 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .activity-item:last-child { border-bottom: none; }
  .activity-model { color: var(--muted); font-size: 10px; }
  .activity-tokens { font-variant-numeric: tabular-nums; }
  .activity-list { background: var(--input-bg); border-radius: 4px; max-height: 200px; overflow-y: auto; }
  .btn { display: block; width: 100%; padding: 6px 12px; border: none; border-radius: 4px; background: var(--btn-bg); color: var(--btn-fg); font-size: 12px; cursor: pointer; text-align: center; }
  .btn:hover { background: var(--btn-hover); }
  .disconnected { text-align: center; padding: 32px 12px; color: var(--muted); }
  .disconnected h3 { font-size: 14px; margin-bottom: 8px; color: var(--fg); }
  .disconnected p { font-size: 12px; line-height: 1.5; margin-bottom: 12px; }
  .disconnected code { background: var(--input-bg); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
  .calls-badge { background: var(--badge-bg); color: var(--badge-fg); padding: 1px 6px; border-radius: 8px; font-size: 10px; }
  .divider { border-top: 1px solid var(--border); margin: 12px 0; }
  .full-width { grid-column: 1 / -1; }
  #connected { display: none; }
</style>
</head>
<body>
  <div id="disconnected" class="disconnected">
    <h3>Token Meter Offline</h3>
    <p>The backend tracker service is not running.</p>
    <p>Start it with:</p>
    <p><code>cd backend && npm start</code></p>
    <p style="margin-top:8px;font-size:11px;">Or install globally:</p>
    <p><code>npm i -g @token-meter/tracker</code></p>
    <p><code>token-meter-tracker</code></p>
  </div>

  <div id="connected">
    <div class="section">
      <div class="section-title">Session <span id="session-calls" class="calls-badge">0 calls</span></div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Input</div>
          <div class="stat-value input" id="s-input">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Output</div>
          <div class="stat-value output" id="s-output">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cache Read</div>
          <div class="stat-value cache-read" id="s-cache-read">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cache Write</div>
          <div class="stat-value cache-write" id="s-cache-write">0</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Estimated Cost</div>
      <div class="cost-row"><span class="label">Session</span><span class="value" id="cost-session">$0.00</span></div>
      <div class="cost-row"><span class="label">All-Time</span><span class="value" id="cost-alltime">$0.00</span></div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">All-Time <span id="alltime-calls" class="calls-badge">0 calls</span></div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Input</div>
          <div class="stat-value input" id="a-input">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Output</div>
          <div class="stat-value output" id="a-output">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cache Read</div>
          <div class="stat-value cache-read" id="a-cache-read">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cache Write</div>
          <div class="stat-value cache-write" id="a-cache-write">0</div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">Recent Activity</div>
      <div class="activity-list" id="activity-list">
        <div class="activity-item" style="color:var(--muted);justify-content:center;">No activity yet</div>
      </div>
    </div>

    <div class="section">
      <button class="btn" id="btn-reset">Reset Session</button>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();

  function fmt(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
  }

  function fmtCost(n) {
    return '$' + n.toFixed(4);
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    return Math.floor(mins / 60) + 'h ago';
  }

  function renderActivity(calls) {
    const el = document.getElementById('activity-list');
    if (!calls || calls.length === 0) {
      el.innerHTML = '<div class="activity-item" style="color:var(--muted);justify-content:center;">No activity yet</div>';
      return;
    }
    el.innerHTML = calls.slice().reverse().map(c => {
      const total = (c.usage.input_tokens || 0) + (c.usage.output_tokens || 0);
      return '<div class="activity-item"><div><span class="activity-model">' + c.model + '</span></div><div class="activity-tokens">' + fmt(total) + ' tokens <span class="activity-model">' + timeAgo(c.timestamp) + '</span></div></div>';
    }).join('');
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'update') {
      document.getElementById('disconnected').style.display = 'none';
      document.getElementById('connected').style.display = 'block';
      const d = msg.data;
      const s = d.session.usage;
      const a = d.all_time;
      document.getElementById('s-input').textContent = fmt(s.input_tokens);
      document.getElementById('s-output').textContent = fmt(s.output_tokens);
      document.getElementById('s-cache-read').textContent = fmt(s.cache_read_tokens);
      document.getElementById('s-cache-write').textContent = fmt(s.cache_creation_tokens);
      document.getElementById('session-calls').textContent = d.session.call_count + ' calls';
      document.getElementById('a-input').textContent = fmt(a.input_tokens);
      document.getElementById('a-output').textContent = fmt(a.output_tokens);
      document.getElementById('a-cache-read').textContent = fmt(a.cache_read_tokens);
      document.getElementById('a-cache-write').textContent = fmt(a.cache_creation_tokens);
      document.getElementById('alltime-calls').textContent = d.all_time_call_count + ' calls';
      document.getElementById('cost-session').textContent = fmtCost(msg.costs.session);
      document.getElementById('cost-alltime').textContent = fmtCost(msg.costs.allTime);
      renderActivity(d.session.recent_calls);
    } else if (msg.type === 'disconnected') {
      document.getElementById('disconnected').style.display = 'block';
      document.getElementById('connected').style.display = 'none';
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    vscode.postMessage({ command: 'reset' });
  });
</script>
</body>
</html>`;
}
