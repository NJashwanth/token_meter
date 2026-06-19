import * as vscode from 'vscode';
import { UsageData } from './api-client';

function formatCount(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000) { return (n / 1_000).toFixed(1) + 'k'; }
  return n.toString();
}

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private connected = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'tokenMeter.showDashboard';
    this.setDisconnected();
    this.item.show();
  }

  update(data: UsageData): void {
    const s = data.session;
    const total = s.inputTokens + s.outputTokens;
    const threshold = vscode.workspace.getConfiguration('tokenMeter').get<number>('warningThreshold', 100000);

    let icon: string;
    let color: vscode.ThemeColor | undefined;
    if (total >= threshold) {
      icon = '$(warning)';
      color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else if (total >= threshold * 0.7) {
      icon = '$(dashboard)';
      color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      icon = '$(dashboard)';
      color = undefined;
    }

    this.item.text = `${icon} In: ${formatCount(s.inputTokens)} | Out: ${formatCount(s.outputTokens)}`;
    this.item.tooltip = `Token Meter — Session Total: ${total.toLocaleString()}\nInput: ${s.inputTokens.toLocaleString()} | Output: ${s.outputTokens.toLocaleString()}\nCache Read: ${s.cacheReadTokens.toLocaleString()} | Cache Write: ${s.cacheCreationTokens.toLocaleString()}\nCalls: ${s.callCount}`;
    this.item.color = color;
    this.item.backgroundColor = total >= threshold ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.connected = true;
  }

  setDisconnected(): void {
    this.item.text = '$(debug-disconnect) Token Meter: Offline';
    this.item.tooltip = 'Token Meter backend not detected. Run the backend service to start.';
    this.item.color = new vscode.ThemeColor('disabledForeground');
    this.item.backgroundColor = undefined;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  dispose(): void {
    this.item.dispose();
  }
}
