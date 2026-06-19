import * as vscode from 'vscode';
import { UsageData } from '../api-client';

const MODEL_COSTS: { [prefix: string]: { input: number; output: number; cacheRead: number; cacheWrite: number } } = {
  'claude-opus': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-fable': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'default': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

function getCostRate(model: string) {
  for (const prefix of Object.keys(MODEL_COSTS)) {
    if (prefix !== 'default' && model.startsWith(prefix)) { return MODEL_COSTS[prefix]; }
  }
  return MODEL_COSTS['default'];
}

function estimateCostFromTotals(totals: { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }): number {
  const rate = MODEL_COSTS['default'];
  return (
    (totals.inputTokens / 1_000_000) * rate.input +
    (totals.outputTokens / 1_000_000) * rate.output +
    (totals.cacheReadTokens / 1_000_000) * rate.cacheRead +
    (totals.cacheCreationTokens / 1_000_000) * rate.cacheWrite
  );
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokenMeter.sidebar';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'saveApiKey':
          vscode.commands.executeCommand('tokenMeter.setApiKey', msg.apiKey);
          break;
        case 'reset':
          vscode.commands.executeCommand('tokenMeter.resetSession');
          break;
        case 'copyText':
          vscode.env.clipboard.writeText(msg.text);
          vscode.window.showInformationMessage('Copied to clipboard');
          break;
        case 'openExternal':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    });
    this._renderHtml();
  }

  update(data: UsageData, isConfigured: boolean): void {
    if (this._view) {
      const costs = {
        session: estimateCostFromTotals(data.session),
        allTime: estimateCostFromTotals(data.allTime),
      };
      this._view.webview.postMessage({ type: 'update', data, costs, isConfigured });
    }
  }

  setDisconnected(): void {
    if (this._view) {
      this._view.webview.postMessage({ type: 'disconnected' });
    }
  }

  showKeyStatus(valid: boolean, message?: string): void {
    if (this._view) {
      this._view.webview.postMessage({ type: 'keyStatus', valid, message });
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
    --input-border: var(--vscode-input-border);
    --input-fg: var(--vscode-input-foreground);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --btn-sec-bg: var(--vscode-button-secondaryBackground);
    --btn-sec-fg: var(--vscode-button-secondaryForeground);
    --success: #3fb950;
    --error: #f85149;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--fg); background: var(--bg); padding: 12px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
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
  .btn-secondary { background: var(--btn-sec-bg); color: var(--btn-sec-fg); }
  .btn-secondary:hover { opacity: 0.9; }
  .btn-small { display: inline-block; width: auto; padding: 2px 8px; font-size: 10px; }
  .disconnected { text-align: center; padding: 32px 12px; color: var(--muted); }
  .disconnected h3 { font-size: 14px; margin-bottom: 8px; color: var(--fg); }
  .disconnected p { font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
  .disconnected code { background: var(--input-bg); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
  .calls-badge { background: var(--badge-bg); color: var(--badge-fg); padding: 1px 6px; border-radius: 8px; font-size: 10px; }
  .divider { border-top: 1px solid var(--border); margin: 12px 0; }

  /* API Key setup */
  .setup-section { margin-bottom: 16px; }
  .setup-section h3 { font-size: 13px; margin-bottom: 8px; }
  .setup-section p { font-size: 12px; color: var(--muted); margin-bottom: 8px; line-height: 1.4; }
  .key-input-row { display: flex; gap: 6px; margin-bottom: 6px; }
  .key-input { flex: 1; padding: 5px 8px; border: 1px solid var(--input-border); border-radius: 4px; background: var(--input-bg); color: var(--input-fg); font-size: 12px; font-family: monospace; }
  .key-status { font-size: 11px; padding: 4px 0; }
  .key-status.valid { color: var(--success); }
  .key-status.invalid { color: var(--error); }
  .link { color: var(--accent); cursor: pointer; text-decoration: none; font-size: 11px; }
  .link:hover { text-decoration: underline; }

  /* Config snippets */
  .snippet-block { background: var(--input-bg); border-radius: 4px; padding: 8px; margin-bottom: 6px; position: relative; }
  .snippet-label { font-size: 10px; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
  .snippet-code { font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
  .snippet-copy { position: absolute; top: 6px; right: 6px; background: var(--btn-sec-bg); color: var(--btn-sec-fg); border: none; border-radius: 3px; padding: 2px 6px; font-size: 9px; cursor: pointer; }
  .snippet-copy:hover { opacity: 0.8; }

  .configured-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 8px; font-size: 10px; background: rgba(63, 185, 80, 0.15); color: var(--success); }

  #view-connected { display: none; }
  #view-setup { display: none; }
</style>
</head>
<body>

<!-- Disconnected state -->
<div id="view-disconnected" class="disconnected">
  <h3>Token Meter Offline</h3>
  <p>The backend proxy service is not running.</p>
  <p>Start it with:</p>
  <p><code>cd backend && npm start</code></p>
</div>

<!-- Setup state (connected but no API key) -->
<div id="view-setup">
  <div class="setup-section">
    <h3>Setup API Key</h3>
    <p>Enter your Claude API key to start tracking token usage.</p>
    <div class="key-input-row">
      <input type="password" class="key-input" id="api-key-input" placeholder="sk-ant-..." />
      <button class="btn btn-small" id="btn-save-key">Save</button>
    </div>
    <div class="key-status" id="key-status"></div>
    <a class="link" id="link-get-key">Get your API key →</a>
  </div>
</div>

<!-- Connected state -->
<div id="view-connected">

  <!-- API Key status + config -->
  <div class="section">
    <div class="section-title">Configuration <span class="configured-badge" id="config-badge">● Connected</span></div>
    <div class="snippet-block">
      <div class="snippet-label">Python</div>
      <div class="snippet-code" id="snippet-python"></div>
      <button class="snippet-copy" data-target="snippet-python">Copy</button>
    </div>
    <div class="snippet-block">
      <div class="snippet-label">JavaScript / TypeScript</div>
      <div class="snippet-code" id="snippet-js"></div>
      <button class="snippet-copy" data-target="snippet-js">Copy</button>
    </div>
    <div class="snippet-block">
      <div class="snippet-label">cURL</div>
      <div class="snippet-code" id="snippet-curl"></div>
      <button class="snippet-copy" data-target="snippet-curl">Copy</button>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Session stats -->
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

  <!-- Cost estimates -->
  <div class="section">
    <div class="section-title">Estimated Cost</div>
    <div class="cost-row"><span class="label">Session</span><span class="value" id="cost-session">$0.00</span></div>
    <div class="cost-row"><span class="label">All-Time</span><span class="value" id="cost-alltime">$0.00</span></div>
  </div>

  <div class="divider"></div>

  <!-- All-time stats -->
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

  <!-- Recent activity -->
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
  const BACKEND_URL = 'http://localhost:3847';

  function fmt(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
  }

  function fmtCost(n) { return '$' + n.toFixed(4); }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    return Math.floor(mins / 60) + 'h ago';
  }

  function showView(name) {
    document.getElementById('view-disconnected').style.display = name === 'disconnected' ? 'block' : 'none';
    document.getElementById('view-setup').style.display = name === 'setup' ? 'block' : 'none';
    document.getElementById('view-connected').style.display = name === 'connected' ? 'block' : 'none';
  }

  function updateSnippets() {
    document.getElementById('snippet-python').textContent = 'client = Anthropic(base_url="' + BACKEND_URL + '")';
    document.getElementById('snippet-js').textContent = 'new Anthropic({ baseURL: "' + BACKEND_URL + '" })';
    document.getElementById('snippet-curl').textContent = 'curl ' + BACKEND_URL + '/v1/messages \\\\\\n  -H "content-type: application/json" \\\\\\n  -d \'{"model":"...","messages":[...]}\'';
  }

  function renderActivity(calls) {
    const el = document.getElementById('activity-list');
    if (!calls || calls.length === 0) {
      el.innerHTML = '<div class="activity-item" style="color:var(--muted);justify-content:center;">No activity yet</div>';
      return;
    }
    el.innerHTML = calls.map(c => {
      const total = (c.inputTokens || 0) + (c.outputTokens || 0);
      return '<div class="activity-item"><div><span class="activity-model">' + c.model + '</span></div><div class="activity-tokens">' + fmt(total) + ' tok <span class="activity-model">' + timeAgo(c.timestamp) + '</span></div></div>';
    }).join('');
  }

  // Message handler
  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'disconnected') {
      showView('disconnected');
    }

    if (msg.type === 'update') {
      if (!msg.isConfigured) {
        showView('setup');
        return;
      }
      showView('connected');
      updateSnippets();

      const s = msg.data.session;
      const a = msg.data.allTime;
      document.getElementById('s-input').textContent = fmt(s.inputTokens);
      document.getElementById('s-output').textContent = fmt(s.outputTokens);
      document.getElementById('s-cache-read').textContent = fmt(s.cacheReadTokens);
      document.getElementById('s-cache-write').textContent = fmt(s.cacheCreationTokens);
      document.getElementById('session-calls').textContent = s.callCount + ' calls';

      document.getElementById('a-input').textContent = fmt(a.inputTokens);
      document.getElementById('a-output').textContent = fmt(a.outputTokens);
      document.getElementById('a-cache-read').textContent = fmt(a.cacheReadTokens);
      document.getElementById('a-cache-write').textContent = fmt(a.cacheCreationTokens);
      document.getElementById('alltime-calls').textContent = a.callCount + ' calls';

      document.getElementById('cost-session').textContent = fmtCost(msg.costs.session);
      document.getElementById('cost-alltime').textContent = fmtCost(msg.costs.allTime);

      renderActivity(s.recentCalls);
    }

    if (msg.type === 'keyStatus') {
      const el = document.getElementById('key-status');
      if (msg.valid) {
        el.textContent = '✓ API key configured successfully';
        el.className = 'key-status valid';
      } else {
        el.textContent = '✗ ' + (msg.message || 'Invalid API key');
        el.className = 'key-status invalid';
      }
    }
  });

  // Save API key
  document.getElementById('btn-save-key').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key) return;
    document.getElementById('key-status').textContent = 'Validating...';
    document.getElementById('key-status').className = 'key-status';
    vscode.postMessage({ command: 'saveApiKey', apiKey: key });
  });

  document.getElementById('api-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-save-key').click();
  });

  // Reset session
  document.getElementById('btn-reset').addEventListener('click', () => {
    vscode.postMessage({ command: 'reset' });
  });

  // Get API key link
  document.getElementById('link-get-key').addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ command: 'openExternal', url: 'https://console.anthropic.com/account/keys' });
  });

  // Copy buttons
  document.querySelectorAll('.snippet-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const text = document.getElementById(target).textContent;
      vscode.postMessage({ command: 'copyText', text });
    });
  });
</script>
</body>
</html>`;
}
