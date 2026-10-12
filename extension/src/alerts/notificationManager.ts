import * as vscode from 'vscode';
import { exec } from 'child_process';
import { PermissionEvent } from '../events/permissionEvent';
import { SettingsManager } from '../config/settings';

export class NotificationManager {
  private settings = SettingsManager.getInstance();

  /**
   * Displays an informative desktop notification prompt with actionable focus.
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
    
    // Determine the most relevant action button
    const focusOption = event.type === 'terminal_command' 
      ? 'Review in Terminal' 
      : 'Review in Chat';
    const altOption = 'Focus Window';

    try {
      const selected = await vscode.window.showWarningMessage(
        message,
        focusOption,
        altOption,
        muteOption
      );

      if (selected === focusOption || selected === altOption) {
        if (this.settings.getFocusWindowOnClick()) {
          await this.focusAgentContext(event);
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

  /**
   * Brings the application window to the foreground and focuses the relevant context.
   */
  public async focusAgentContext(event: PermissionEvent): Promise<void> {
    // 1. Bring window to the foreground at the OS level
    this.bringWindowToFront();

    // 2. Focus the relevant interactive panel within VS Code
    try {
      if (event.type === 'terminal_command') {
        // Focus integrated terminal where command is waiting
        await vscode.commands.executeCommand('workbench.action.terminal.focus');
      } else {
        // Focus chat panel or auxiliary sidebar where tool/permission prompt is waiting
        try {
          await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch {
          await vscode.commands.executeCommand('workbench.action.focusSideBar');
        }
      }
    } catch {
      // Fallback: focus editor group
      try {
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * OS-level window activation.
   */
  private bringWindowToFront(): void {
    try {
      const appName = vscode.env.appName || 'Visual Studio Code';
      if (process.platform === 'darwin') {
        exec(`open -a "${appName}"`, (err) => {
          if (err) {
            exec(`osascript -e 'tell application "${appName}" to activate'`, () => {});
          }
        });
      } else if (process.platform === 'win32') {
        exec(`powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate('${appName}')"`, () => {});
      }
    } catch (err) {
      console.warn('[HeyHuman] OS focus activation error:', err);
    }
  }
}
