import * as vscode from 'vscode';
import { getUsage, resetSession, checkStatus, configureApiKey } from './api-client';
import { StatusBarManager } from './status-bar';
import { SidebarProvider } from './webview/sidebar-provider';

const SECRET_KEY = 'token-meter-api-key';
let pollTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const statusBar = new StatusBarManager();
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  let isConfigured = false;

  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  // Send stored API key to backend on startup
  async function syncApiKey(): Promise<void> {
    const storedKey = await context.secrets.get(SECRET_KEY);
    if (storedKey) {
      const result = await configureApiKey(storedKey);
      isConfigured = result.success;
    }
  }

  // Set API key command (called from webview)
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMeter.setApiKey', async (apiKey: string) => {
      const result = await configureApiKey(apiKey);
      if (result.success) {
        await context.secrets.store(SECRET_KEY, apiKey);
        isConfigured = true;
        sidebarProvider.showKeyStatus(true);
        vscode.window.showInformationMessage('Token Meter: API key configured successfully.');
        await poll();
      } else {
        sidebarProvider.showKeyStatus(false, result.error);
        vscode.window.showErrorMessage(`Token Meter: ${result.error ?? 'Failed to configure API key.'}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMeter.resetSession', async () => {
      const ok = await resetSession();
      if (ok) {
        vscode.window.showInformationMessage('Token Meter: Session reset.');
        await poll();
      } else {
        vscode.window.showWarningMessage('Token Meter: Could not reset session. Is the backend running?');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenMeter.showDashboard', () => {
      vscode.commands.executeCommand('tokenMeter.sidebar.focus');
    })
  );

  let lastWarningShown = 0;

  async function poll() {
    const status = await checkStatus();
    if (!status) {
      statusBar.setDisconnected();
      sidebarProvider.setDisconnected();
      isConfigured = false;
      return;
    }

    // If backend is up but not configured, try syncing the stored key
    if (!status.isConfigured && !isConfigured) {
      await syncApiKey();
    } else {
      isConfigured = status.isConfigured;
    }

    const data = await getUsage();
    if (!data) {
      statusBar.setDisconnected();
      sidebarProvider.setDisconnected();
      return;
    }

    statusBar.update(data);
    sidebarProvider.update(data, isConfigured);

    const threshold = vscode.workspace.getConfiguration('tokenMeter').get<number>('warningThreshold', 100000);
    const sessionTotal = data.session.inputTokens + data.session.outputTokens;
    if (sessionTotal >= threshold && Date.now() - lastWarningShown > 60_000) {
      lastWarningShown = Date.now();
      vscode.window.showWarningMessage(
        `Token Meter: Session usage (${sessionTotal.toLocaleString()} tokens) exceeded threshold (${threshold.toLocaleString()}).`
      );
    }
  }

  function startPolling() {
    if (pollTimer) { clearInterval(pollTimer); }
    const interval = vscode.workspace.getConfiguration('tokenMeter').get<number>('refreshInterval', 2000);
    poll();
    pollTimer = setInterval(poll, interval);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tokenMeter')) { startPolling(); }
    })
  );

  context.subscriptions.push({ dispose: () => { if (pollTimer) { clearInterval(pollTimer); } } });

  startPolling();
}

export function deactivate() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}
