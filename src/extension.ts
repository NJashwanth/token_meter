import * as vscode from 'vscode';
import { getUsage, resetSession, checkStatus } from './api-client';
import { StatusBarManager } from './status-bar';
import { SidebarProvider } from './webview/sidebar-provider';

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const statusBar = new StatusBarManager();
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
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
    const data = await getUsage();
    if (!data) {
      statusBar.setDisconnected();
      sidebarProvider.setDisconnected();
      return;
    }

    statusBar.update(data);
    sidebarProvider.update(data);

    const threshold = vscode.workspace.getConfiguration('tokenMeter').get<number>('warningThreshold', 100000);
    const sessionTotal = data.session.usage.input_tokens + data.session.usage.output_tokens;
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
      if (e.affectsConfiguration('tokenMeter')) {
        startPolling();
      }
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
