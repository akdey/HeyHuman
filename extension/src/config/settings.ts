import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentType, PermissionType } from '../events/permissionEvent';

export type SoundType = 'siren' | 'alarm' | 'chime' | 'beep';

export class SettingsManager {
  private static instance: SettingsManager;
  private mutedUntil: Date | null = null;
  private phoneAlertsOverride: boolean | null = null;
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
    if (agent === 'claude') {
      return this.getConfig().get<boolean>('agents.claude.enabled', true);
    }
    if (agent === 'cursor') {
      return this.getConfig().get<boolean>('agents.cursor.enabled', true);
    }
    if (agent === 'aider') {
      return this.getConfig().get<boolean>('agents.aider.enabled', true);
    }
    return true;
  }

  public async setAgentEnabled(agent: AgentType, value: boolean): Promise<void> {
    if (agent === 'copilot') {
      await this.getConfig().update('agents.copilot.enabled', value, vscode.ConfigurationTarget.Global);
    } else if (agent === 'antigravity') {
      await this.getConfig().update('agents.antigravity.enabled', value, vscode.ConfigurationTarget.Global);
    } else if (agent === 'claude') {
      await this.getConfig().update('agents.claude.enabled', value, vscode.ConfigurationTarget.Global);
    } else if (agent === 'cursor') {
      await this.getConfig().update('agents.cursor.enabled', value, vscode.ConfigurationTarget.Global);
    } else if (agent === 'aider') {
      await this.getConfig().update('agents.aider.enabled', value, vscode.ConfigurationTarget.Global);
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

  public getClaudeCustomLogPath(): string {
    return this.getConfig().get<string>('claude.customLogPath', '').trim();
  }

  public getCursorCustomLogPath(): string {
    return this.getConfig().get<string>('cursor.customLogPath', '').trim();
  }

  public getAiderCustomLogPath(): string {
    return this.getConfig().get<string>('aider.customLogPath', '').trim();
  }

  // Notification Triggers (When to notify - Checkboxes in Settings UI)
  public isNotifyOnPermissionNeeded(): boolean {
    return this.getConfig().get<boolean>('notifyOn.permissionNeeded', true);
  }

  public async setNotifyOnPermissionNeeded(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.permissionNeeded', value);
  }

  public isNotifyOnCodeFinish(): boolean {
    return this.getConfig().get<boolean>('notifyOn.codeFinish', true);
  }

  public async setNotifyOnCodeFinish(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.codeFinish', value);
  }

  public isNotifyOnQuestionInput(): boolean {
    return this.getConfig().get<boolean>('notifyOn.questionInput', true);
  }

  public async setNotifyOnQuestionInput(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.questionInput', value);
  }

  public isNotifyOnTaskError(): boolean {
    return this.getConfig().get<boolean>('notifyOn.taskError', true);
  }

  public async setNotifyOnTaskError(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.taskError', value);
  }

  public isNotifyOnSubagentMilestone(): boolean {
    return this.getConfig().get<boolean>('notifyOn.subagentMilestone', false);
  }

  public async setNotifyOnSubagentMilestone(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.subagentMilestone', value);
  }

  public isNotifyOnContextLimitWarning(): boolean {
    return this.getConfig().get<boolean>('notifyOn.contextLimitWarning', false);
  }

  public async setNotifyOnContextLimitWarning(value: boolean): Promise<void> {
    await this.safeUpdate('notifyOn.contextLimitWarning', value);
  }

  public isNotificationTriggerEnabled(type: PermissionType): boolean {
    if (type === 'code_finish') {
      return this.isNotifyOnCodeFinish();
    }
    if (type === 'task_error') {
      return this.isNotifyOnTaskError();
    }
    if (type === 'question_input') {
      return this.isNotifyOnQuestionInput();
    }
    if (type === 'subagent_milestone') {
      return this.isNotifyOnSubagentMilestone();
    }
    if (type === 'context_limit') {
      return this.isNotifyOnContextLimitWarning();
    }
    // All other permission types (terminal_command, tool_execution, confirmation_dialog, file_access, other)
    return this.isNotifyOnPermissionNeeded();
  }

  // Webhook / Web App Room & Mobile Phone Sync
  public isPhoneAlertsEnabled(): boolean {
    if (!this.isEnabled()) {
      return false;
    }
    if (this.phoneAlertsOverride !== null) {
      return this.phoneAlertsOverride;
    }
    return this.getConfig().get<boolean>('phoneAlerts.enabled', false);
  }

  public async setPhoneAlertsEnabled(value: boolean): Promise<void> {
    this.phoneAlertsOverride = value;
    this.onDidChangeSettingsEmitter.fire();
    await this.safeUpdate('phoneAlerts.enabled', value);
  }

  /**
   * Resilient config updater: updates Global settings, falls back to Workspace target,
   * or writes directly to .vscode/settings.json if schema is not yet registered in running host.
   */
  private async safeUpdate(section: string, value: any): Promise<void> {
    try {
      await this.getConfig().update(section, value, vscode.ConfigurationTarget.Global);
    } catch (err) {
      try {
        await this.getConfig().update(section, value, vscode.ConfigurationTarget.Workspace);
      } catch (wsErr) {
        this.writeFallbackWorkspaceSetting(`heyhuman.${section}`, value);
      }
    }
  }

  private writeFallbackWorkspaceSetting(key: string, value: any): void {
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      const rootPath = folders[0].uri.fsPath;
      const vscodeDir = path.join(rootPath, '.vscode');
      const settingsFile = path.join(vscodeDir, 'settings.json');
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }
      let existing: Record<string, any> = {};
      if (fs.existsSync(settingsFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
        } catch {}
      }
      existing[key] = value;
      fs.writeFileSync(settingsFile, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[HeyHuman] Failed to write fallback workspace setting:', e);
    }
  }

  public getWebRoom(): string {
    return this.getConfig().get<string>('webRoom', '').trim();
  }

  public async setWebRoom(room: string): Promise<void> {
    await this.safeUpdate('webRoom', room.trim());
  }

  public getWebEndpoint(): string {
    return this.getConfig().get<string>('webEndpoint', 'https://hey-human-akdey.vercel.app').trim();
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
