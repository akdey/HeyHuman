import * as vscode from 'vscode';
import { PermissionEvent } from '../events/permissionEvent';
import { SettingsManager } from '../config/settings';

export class NotificationManager {
  private settings = SettingsManager.getInstance();

  /**
   * Displays an informative desktop notification prompt.
   */
  public async showPermissionNotification(
    event: PermissionEvent,
    callbacks?: {
      onMuteRequested?: () => void;
      onDismissRequested?: () => void;
    }
  ): Promise<void> {
    if (!this.settings.isNotificationsEnabled()) {
      return;
    }

    const agentTitle = event.agent === 'copilot' 
      ? 'GitHub Copilot' 
      : event.agent === 'antigravity' 
        ? 'Google Antigravity' 
        : event.agent === 'claude'
          ? 'Claude Code'
          : event.agent === 'cursor'
            ? 'Cursor Agent'
            : event.agent === 'aider'
              ? 'Aider'
              : 'AI Agent';

    const shortSummary = event.summary ? `: ${event.summary}` : '';
    const message = `🚨 HeyHuman! ${agentTitle} needs your permission${shortSummary}`;

    const muteOption = `Mute (${this.settings.getTemporaryMuteDurationMinutes()}m)`;
    const focusOption = 'Focus Editor';

    try {
      const selected = await vscode.window.showWarningMessage(
        message,
        focusOption,
        muteOption
      );

      if (selected === focusOption) {
        // Focus the editor/window
        if (this.settings.getFocusWindowOnClick()) {
          await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
      } else if (selected === muteOption) {
        this.settings.muteForMinutes();
        if (callbacks?.onMuteRequested) {
          callbacks.onMuteRequested();
        }
      } else {
        if (callbacks?.onDismissRequested) {
          callbacks.onDismissRequested();
        }
      }
    } catch (err) {
      console.warn('[HeyHuman] Failed to display notification:', err);
    }
  }
}
