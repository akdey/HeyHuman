import * as vscode from 'vscode';
import { PermissionEvent } from '../events/permissionEvent';
import { SettingsManager } from '../config/settings';
import { AudioPlayer } from './audioPlayer';
import { NotificationManager } from './notificationManager';

export interface AlertManagerOptions {
  audioPlayer: AudioPlayer;
  notificationManager: NotificationManager;
}

export class AlertManager {
  private audioPlayer: AudioPlayer;
  private notificationManager: NotificationManager;
  private settings = SettingsManager.getInstance();
  private lastAlertTimestamp = 0;
  private actionPollerTimer: NodeJS.Timeout | null = null;
  private lastProcessedActionTime = Date.now();

  private readonly remoteActionEmitter = new vscode.EventEmitter<{ id?: string; action: string; input?: string; timestamp?: number }>();
  public readonly onRemoteAction = this.remoteActionEmitter.event;

  constructor(options: AlertManagerOptions) {
    this.audioPlayer = options.audioPlayer;
    this.notificationManager = options.notificationManager;
    this.startRemoteActionPoller();
  }

  /**
   * Evaluates alert criteria and triggers sound & notification.
   */
  public async triggerAlert(event: PermissionEvent): Promise<boolean> {
    if (!this.settings.isEnabled()) {
      return false;
    }

    if (!this.settings.isAgentEnabled(event.agent)) {
      return false;
    }

    if (this.settings.isMuted()) {
      return false;
    }

    const now = Date.now();
    const cooldownMs = this.settings.getCooldownSeconds() * 1000;
    if (now - this.lastAlertTimestamp < cooldownMs) {
      return false;
    }

    this.lastAlertTimestamp = now;

    // 5. Play audio if sound enabled
    if (this.settings.isSoundEnabled()) {
      const soundType = this.settings.getSoundType();
      const volume = this.settings.getSoundVolume();
      const customPath = this.settings.getCustomSoundPath();
      this.audioPlayer.playSound(soundType, volume, customPath).catch((err) => {
        console.warn('[HeyHuman] Audio playback error:', err);
      });
    }

    // 6. Show desktop notification if enabled
    if (this.settings.isNotificationsEnabled()) {
      this.notificationManager.showPermissionNotification(event).catch((err) => {
        console.warn('[HeyHuman] Notification error:', err);
      });
    }

    // 7. Dispatch to Mobile Web App room if configured
    const webRoom = this.settings.getWebRoom();
    if (webRoom) {
      this.dispatchWebAlert(event, webRoom).catch((err) => {
        console.warn('[HeyHuman] Web alert dispatch error:', err);
      });
    }

    return true;
  }

  /**
   * Dispatches the alert to the HeyHuman web app room for mobile sirens
   */
  private async dispatchWebAlert(event: PermissionEvent, room: string): Promise<void> {
    try {
      const endpoint = this.settings.getWebEndpoint();
      const url = `${endpoint.replace(/\/+$/, '')}/api/alert?room=${encodeURIComponent(room)}`;
      const payload = {
        id: event.id,
        agent: event.agent.toUpperCase(),
        tool: event.type,
        command: event.details || '',
        description: event.summary,
        timestamp: event.timestamp
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.warn('[HeyHuman] Web alert returned status', res.status);
      }
    } catch (err) {
      console.warn('[HeyHuman] Failed to send web alert:', err);
    }
  }

  /**
   * Polls for remote actions sent from mobile (Approve, Reject, Focus)
   */
  private startRemoteActionPoller(): void {
    this.actionPollerTimer = setInterval(async () => {
      const room = this.settings.getWebRoom();
      if (!room) return;

      try {
        const endpoint = this.settings.getWebEndpoint();
        const url = `${endpoint.replace(/\/+$/, '')}/api/alert?room=${encodeURIComponent(room)}&since=${this.lastProcessedActionTime}`;
        const res = await fetch(url);
        if (!res.ok) return;

        const data = (await res.json()) as any;
        if (data && data.ok && Array.isArray(data.actions) && data.actions.length > 0) {
          for (const act of data.actions) {
            if (act.timestamp > this.lastProcessedActionTime) {
              this.lastProcessedActionTime = act.timestamp;
              await this.handleRemoteAction(act);
            }
          }
        }
      } catch {
        // Silently retry next poll
      }
    }, 1500);
  }

  /**
   * Executes remote approval or focus action on the desktop
   */
  private async handleRemoteAction(action: { id?: string; action: string; input?: string; timestamp?: number }): Promise<void> {
    console.log(`[HeyHuman] Executing remote action from phone: ${action.action}`);

    // Broadcast remote action to agent detectors (e.g. Antigravity companion bridge)
    this.remoteActionEmitter.fire(action);

    if (action.action === 'approve') {
      // 1. Bring window to front
      this.notificationManager.bringWindowToFront();

      // 2. Send approval input to active terminal (Claude Code / Aider / CLI)
      const input = action.input || 'y';
      if (vscode.window.activeTerminal) {
        vscode.window.activeTerminal.sendText(input);
      } else if (vscode.window.terminals.length > 0) {
        vscode.window.terminals[0].sendText(input);
      }

      vscode.window.showInformationMessage(`📱 HeyHuman: Remote Approval applied ('${input}') from mobile.`);
    } else if (action.action === 'reject') {
      this.notificationManager.bringWindowToFront();
      if (vscode.window.activeTerminal) {
        vscode.window.activeTerminal.sendText('n');
      }
      vscode.window.showInformationMessage('📱 HeyHuman: Action rejected from mobile.');
    } else if (action.action === 'focus') {
      await this.notificationManager.focusAgentContext();
    }
  }

  /**
   * Tests the sound configured by the user.
   */
  public async testSound(): Promise<boolean> {
    const soundType = this.settings.getSoundType();
    const volume = this.settings.getSoundVolume();
    const customPath = this.settings.getCustomSoundPath();
    return this.audioPlayer.playSound(soundType, volume, customPath);
  }

  public dispose(): void {
    if (this.actionPollerTimer) {
      clearInterval(this.actionPollerTimer);
      this.actionPollerTimer = null;
    }
    this.remoteActionEmitter.dispose();
    this.audioPlayer.dispose();
  }
}
