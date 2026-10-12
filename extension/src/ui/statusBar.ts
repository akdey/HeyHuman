import * as vscode from 'vscode';
import { SettingsManager } from '../config/settings';
import { IAgentDetector } from '../detectors/detectorTypes';

export class StatusBarController implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private settings = SettingsManager.getInstance();
  private detectors: IAgentDetector[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(detectors: IAgentDetector[]) {
    this.detectors = detectors;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'heyhuman.showQuickMenu';
    this.disposables.push(this.statusBarItem);

    this.disposables.push(
      this.settings.onDidChangeSettings(() => {
        this.update();
      })
    );

    // Refresh every 30 seconds to update mute remaining countdown
    this.refreshTimer = setInterval(() => {
      this.update();
    }, 30000);

    this.update();
    this.statusBarItem.show();
  }

  public update(): void {
    if (!this.settings.isEnabled()) {
      this.statusBarItem.text = '$(mute) HeyHuman: Off';
      this.statusBarItem.tooltip = 'HeyHuman AI Permission Alerts are disabled. Click to configure.';
      this.statusBarItem.color = new vscode.ThemeColor('descriptionForeground');
      return;
    }

    if (this.settings.isMuted()) {
      const remaining = this.settings.getMuteRemainingMinutes();
      this.statusBarItem.text = `$(bell-slash) HeyHuman: Muted (${remaining}m)`;
      this.statusBarItem.tooltip = `HeyHuman alerts are muted for another ${remaining} minutes. Click to unmute.`;
      this.statusBarItem.color = new vscode.ThemeColor('editorWarning.foreground');
      return;
    }

    this.statusBarItem.text = '$(bell) HeyHuman: On';
    this.statusBarItem.color = undefined;

    // Build comprehensive tooltip
    const lines = [
      'HeyHuman: AI Permission Alerts Active',
      '─────────────────────────',
      `Sound: ${this.settings.isSoundEnabled() ? this.settings.getSoundType() : 'Disabled'} (${this.settings.getSoundVolume()}%)`,
      `Copilot Alerts: ${this.settings.isAgentEnabled('copilot') ? 'Enabled' : 'Disabled'}`,
      `Antigravity Alerts: ${this.settings.isAgentEnabled('antigravity') ? 'Enabled' : 'Disabled'}`,
      '─────────────────────────',
      'Detectors:'
    ];

    for (const d of this.detectors) {
      const status = d.getStatus();
      const icon = status.status === 'active' ? '✓' : status.status === 'idle' ? '○' : '!';
      lines.push(` [${icon}] ${d.name}: ${status.message}`);
    }

    lines.push('─────────────────────────');
    lines.push('Click to open HeyHuman menu');

    this.statusBarItem.tooltip = lines.join('\n');
  }

  public dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
