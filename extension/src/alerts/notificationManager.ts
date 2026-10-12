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
  public async focusAgentContext(event?: PermissionEvent): Promise<void> {
    // 1. Force window to foreground at OS level
    this.bringWindowToFront();

    // 2. Focus internal editor panels
    try {
      if (event && event.type === 'terminal_command') {
        await vscode.commands.executeCommand('workbench.action.terminal.focus');
      } else {
        try {
          await vscode.commands.executeCommand('workbench.action.chat.open');
        } catch {
          await vscode.commands.executeCommand('workbench.action.terminal.focus');
        }
      }
    } catch {
      try {
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Multi-strategy OS-level window activation.
   * Ensures Antigravity IDE, Visual Studio Code, Cursor, or whichever host is running comes to the front.
   */
  public bringWindowToFront(): void {
    try {
      if (process.platform === 'darwin') {
        // Multi-fallback AppleScript targeting active editor hosts
        const appleScript = `
          tell application "System Events"
            set appNames to {"Antigravity IDE", "Antigravity", "Visual Studio Code", "Cursor", "Code"}
            repeat with appName in appNames
              if exists (process appName) then
                tell process appName to set frontmost to true
                exit repeat
              end if
            end repeat
          end tell
        `;
        exec(`osascript -e '${appleScript.replace(/\n/g, ' ')}'`, (err) => {
          if (err) {
            // Direct launch fallback
            exec('open -a "Antigravity IDE" 2>/dev/null || open -a "Visual Studio Code" 2>/dev/null || open -a "Cursor" 2>/dev/null', () => {});
          }
        });
      } else if (process.platform === 'win32') {
        const psScript = `
          $targets = @('Antigravity', 'Code', 'Cursor')
          $wshell = New-Object -ComObject WScript.Shell
          foreach ($t in $targets) {
            if ($wshell.AppActivate($t)) { break }
          }
        `;
        exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, () => {});
      } else if (process.platform === 'linux') {
        exec('wmctrl -x -a code.Code 2>/dev/null || wmctrl -x -a antigravity 2>/dev/null || xdotool search --onlyvisible --class code windowactivate 2>/dev/null', () => {});
      }
    } catch (err) {
      console.warn('[HeyHuman] OS focus activation error:', err);
    }
  }
}
