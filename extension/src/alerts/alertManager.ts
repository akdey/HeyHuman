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

  constructor(options: AlertManagerOptions) {
    this.audioPlayer = options.audioPlayer;
    this.notificationManager = options.notificationManager;
  }

  /**
   * Evaluates alert criteria and triggers sound & notification.
   * Returns true if alert was actively triggered, false if suppressed.
   */
  public async triggerAlert(event: PermissionEvent): Promise<boolean> {
    // 1. Check global enablement
    if (!this.settings.isEnabled()) {
      return false;
    }

    // 2. Check per-agent enablement
    if (!this.settings.isAgentEnabled(event.agent)) {
      return false;
    }

    // 3. Check temporary mute
    if (this.settings.isMuted()) {
      return false;
    }

    // 4. Check cooldown
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
      // Non-blocking fire-and-forget to avoid blocking notification
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
        description: event.details || event.summary,
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
   * Tests the sound configured by the user.
   */
  public async testSound(): Promise<boolean> {
    const soundType = this.settings.getSoundType();
    const volume = this.settings.getSoundVolume();
    const customPath = this.settings.getCustomSoundPath();
    return this.audioPlayer.playSound(soundType, volume, customPath);
  }

  public dispose(): void {
    this.audioPlayer.dispose();
  }
}
