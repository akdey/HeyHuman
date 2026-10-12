import * as vscode from 'vscode';
import { AgentType } from '../events/permissionEvent';

export type SoundType = 'siren' | 'alarm' | 'chime' | 'beep';

export class SettingsManager {
  private static instance: SettingsManager;
  private mutedUntil: Date | null = null;
  private readonly onDidChangeSettingsEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeSettings = this.onDidChangeSettingsEmitter.event;

  private constructor() {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('heyhuman')) {
        this.onDidChangeSettingsEmitter.fire();
      }
    });
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('heyhuman');
  }

  // Master toggle
  public isEnabled(): boolean {
    return this.getConfig().get<boolean>('enabled', true);
  }

  public async setEnabled(value: boolean): Promise<void> {
    await this.getConfig().update('enabled', value, vscode.ConfigurationTarget.Global);
  }

  // Agent toggles
  public isAgentEnabled(agent: AgentType): boolean {
    if (!this.isEnabled()) {
      return false;
    }
    if (agent === 'copilot') {
      return this.getConfig().get<boolean>('agents.copilot.enabled', true);
    }
    if (agent === 'antigravity') {
      return this.getConfig().get<boolean>('agents.antigravity.enabled', true);
    }
    return true;
  }

  public async setAgentEnabled(agent: AgentType, value: boolean): Promise<void> {
    if (agent === 'copilot') {
      await this.getConfig().update('agents.copilot.enabled', value, vscode.ConfigurationTarget.Global);
    } else if (agent === 'antigravity') {
      await this.getConfig().update('agents.antigravity.enabled', value, vscode.ConfigurationTarget.Global);
    }
  }

  // Sound configuration
  public isSoundEnabled(): boolean {
    return this.getConfig().get<boolean>('sound.enabled', true);
  }

  public getSoundType(): SoundType {
    return this.getConfig().get<SoundType>('sound.type', 'siren');
  }

  public getSoundVolume(): number {
    const vol = this.getConfig().get<number>('sound.volume', 80);
    return Math.max(0, Math.min(100, vol));
  }

  public getCustomSoundPath(): string {
    return this.getConfig().get<string>('sound.customSoundPath', '').trim();
  }

  // Notification configuration
  public isNotificationsEnabled(): boolean {
    return this.getConfig().get<boolean>('notifications.enabled', true);
  }

  public getFocusWindowOnClick(): boolean {
    return this.getConfig().get<boolean>('notifications.focusWindowOnClick', true);
  }

  // Cooldown & Mute
  public getCooldownSeconds(): number {
    return this.getConfig().get<number>('alerts.cooldownSeconds', 5);
  }

  public getTemporaryMuteDurationMinutes(): number {
    return this.getConfig().get<number>('alerts.temporaryMuteDurationMinutes', 15);
  }

  // Path configs
  public getAntigravityCustomLogPath(): string {
    return this.getConfig().get<string>('antigravity.customLogPath', '').trim();
  }

  public getAntigravityCompanionPort(): number {
    return this.getConfig().get<number>('antigravity.companionPort', 47291);
  }

  public getCopilotCustomLogPath(): string {
    return this.getConfig().get<string>('copilot.customLogPath', '').trim();
  }

  // Temporary Mute State
  public muteForMinutes(minutes?: number): void {
    const mins = minutes ?? this.getTemporaryMuteDurationMinutes();
    const until = new Date(Date.now() + mins * 60 * 1000);
    this.mutedUntil = until;
    this.onDidChangeSettingsEmitter.fire();
  }

  public unmute(): void {
    if (this.mutedUntil !== null) {
      this.mutedUntil = null;
      this.onDidChangeSettingsEmitter.fire();
    }
  }

  public isMuted(): boolean {
    if (!this.mutedUntil) {
      return false;
    }
    if (Date.now() >= this.mutedUntil.getTime()) {
      this.mutedUntil = null;
      return false;
    }
    return true;
  }

  public getMuteRemainingMinutes(): number {
    if (!this.isMuted() || !this.mutedUntil) {
      return 0;
    }
    const remainingMs = this.mutedUntil.getTime() - Date.now();
    return Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  }

  public dispose(): void {
    this.onDidChangeSettingsEmitter.dispose();
  }
}
