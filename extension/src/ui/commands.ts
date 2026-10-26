import * as vscode from 'vscode';
import { SettingsManager } from '../config/settings';
import { AlertManager } from '../alerts/alertManager';
import { IAgentDetector } from '../detectors/detectorTypes';
import { AntigravityDetector } from '../detectors/antigravityDetector';

export function registerCommands(
  context: vscode.ExtensionContext,
  alertManager: AlertManager,
  detectors: IAgentDetector[]
): void {
  const settings = SettingsManager.getInstance();

  // 1. Toggle Alerts
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.toggleAlerts', async () => {
      const current = settings.isEnabled();
      await settings.setEnabled(!current);
      const msg = !current ? '🔊 HeyHuman alerts enabled.' : '🔇 HeyHuman alerts disabled.';
      vscode.window.showInformationMessage(msg);
    })
  );

  // 2. Enable Alerts
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.enableAlerts', async () => {
      await settings.setEnabled(true);
      vscode.window.showInformationMessage('🔊 HeyHuman alerts enabled.');
    })
  );

  // 3. Disable Alerts
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.disableAlerts', async () => {
      await settings.setEnabled(false);
      vscode.window.showInformationMessage('🔇 HeyHuman alerts disabled.');
    })
  );

  // 4. Test Sound
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.testSound', async () => {
      const soundType = settings.getSoundType();
      const volume = settings.getSoundVolume();
      vscode.window.showInformationMessage(`Testing HeyHuman alert sound (${soundType} at ${volume}% volume)...`);
      const success = await alertManager.testSound();
      if (!success) {
        vscode.window.showWarningMessage('Audio playback failed or sound file could not be found. Check settings or system audio.');
      }
    })
  );

  // 5. Mute Temporarily
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.muteTemporarily', async () => {
      const picks = [
        { label: '15 Minutes', duration: 15 },
        { label: '30 Minutes', duration: 30 },
        { label: '1 Hour', duration: 60 },
        { label: '2 Hours', duration: 120 }
      ];

      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select temporary mute duration'
      });

      if (chosen) {
        settings.muteForMinutes(chosen.duration);
        vscode.window.showInformationMessage(`🔕 HeyHuman alerts muted for ${chosen.duration} minutes.`);
      }
    })
  );

  // 6. Unmute
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.unmute', () => {
      settings.unmute();
      vscode.window.showInformationMessage('🔔 HeyHuman alerts unmuted.');
    })
  );

  // 7. Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'heyhuman');
    })
  );

  // 8. Show Detection Status
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.showStatus', () => {
      const lines = [
        'HeyHuman Status & Diagnostics:',
        `• Master Enabled: ${settings.isEnabled() ? 'Yes' : 'No'}`,
        `• Temporary Mute: ${settings.isMuted() ? `Active (${settings.getMuteRemainingMinutes()}m left)` : 'No'}`,
        `• Sound: ${settings.isSoundEnabled() ? settings.getSoundType() : 'Disabled'} (${settings.getSoundVolume()}%)`,
        `• Phone Alerts: ${settings.isPhoneAlertsEnabled() ? `Enabled (Room: ${settings.getWebRoom() || 'default'})` : 'Disabled (Zero API calls)'}`,
        `• Notifications: ${settings.isNotificationsEnabled() ? 'Enabled' : 'Disabled'}`,
        `• Alert Cooldown: ${settings.getCooldownSeconds()}s`,
        '',
        'Agent Detectors:'
      ];

      for (const d of detectors) {
        const info = d.getStatus();
        lines.push(`• [${d.name}] Status: ${info.status.toUpperCase()} - ${info.message}`);
      }

      vscode.window.showInformationMessage(lines.join('\n'), { modal: true });
    })
  );

  // 9. Interactive Set Web Room Dialog
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.setWebRoom', async () => {
      const current = settings.getWebRoom();
      const input = await vscode.window.showInputBox({
        title: 'HeyHuman: Web Alert Room ID',
        prompt: 'Enter your Room ID to stream alerts to your phone (leave empty to disable)',
        value: current,
        placeHolder: 'e.g. akdey or my-workspace'
      });

      if (input !== undefined) {
        await settings.setWebRoom(input);
        if (input.trim()) {
          await settings.setPhoneAlertsEnabled(true);
          vscode.window.showInformationMessage(`📡 HeyHuman paired to Web Room: ${input.trim()} (Phone notifications enabled)`);
        } else {
          await settings.setPhoneAlertsEnabled(false);
          vscode.window.showInformationMessage('📡 HeyHuman Web Room disabled.');
        }
      }
    })
  );

  // 10. Toggle Phone Notifications
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.togglePhoneAlerts', async () => {
      const current = settings.isPhoneAlertsEnabled();
      await settings.setPhoneAlertsEnabled(!current);
      const msg = !current
        ? `📱 HeyHuman phone notifications enabled (Room: ${settings.getWebRoom() || 'default'}).`
        : '📱 HeyHuman phone notifications disabled (Zero API calls).';
      vscode.window.showInformationMessage(msg);
    })
  );

  // 10. Enable Antigravity Mobile Approval Hook
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.setupAntigravityHook', async () => {
      const ag = detectors.find(d => d.id === 'antigravity') as AntigravityDetector | undefined;
      if (ag) {
        await ag.setupWorkspaceHook();
      } else {
        vscode.window.showWarningMessage('HeyHuman: Antigravity detector is not active.');
      }
    })
  );

  // 11. Status Bar Quick Menu
  context.subscriptions.push(
    vscode.commands.registerCommand('heyhuman.showQuickMenu', async () => {
      const isEnabled = settings.isEnabled();
      const isMuted = settings.isMuted();

      const items: vscode.QuickPickItem[] = [
        {
          label: isEnabled ? '$(mute) Disable Alerts' : '$(bell) Enable Alerts',
          description: isEnabled ? 'Turn off all HeyHuman alarms' : 'Turn on HeyHuman alarms'
        },
        {
          label: isMuted ? '$(bell) Unmute Alerts' : '$(bell-slash) Mute Temporarily...',
          description: isMuted ? `Currently muted (${settings.getMuteRemainingMinutes()}m remaining)` : 'Silence alerts temporarily'
        },
        {
          label: '$(play) Test Sound',
          description: `Play current sound (${settings.getSoundType()})`
        },
        {
          label: '$(shield) Enable Antigravity Mobile Approvals',
          description: 'Install workspace hook to approve Antigravity from phone'
        },
        {
          label: '$(info) Detection Status & Diagnostics',
          description: 'View active detectors and connection states'
        },
        {
          label: settings.isPhoneAlertsEnabled() ? '$(device-mobile) Disable Phone Alerts' : '$(device-mobile) Enable Phone Alerts',
          description: settings.isPhoneAlertsEnabled()
            ? `Active for room '${settings.getWebRoom() || 'default'}'`
            : 'Opt-in to send alerts to mobile phone'
        },
        {
          label: '$(broadcast) Pair Web Alert Room...',
          description: settings.getWebRoom() ? `Currently paired to '${settings.getWebRoom()}'` : 'Stream sirens to your mobile phone'
        },
        {
          label: '$(gear) Configure Settings',
          description: 'Adjust sound volume, type, agents, and timeouts'
        }
      ];

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: `HeyHuman Status: ${isEnabled ? (isMuted ? 'Muted' : 'Active') : 'Disabled'}`
      });

      if (!selection) {
        return;
      }

      if (selection.label.includes('Disable Alerts')) {
        await vscode.commands.executeCommand('heyhuman.disableAlerts');
      } else if (selection.label.includes('Enable Alerts')) {
        await vscode.commands.executeCommand('heyhuman.enableAlerts');
      } else if (selection.label.includes('Disable Phone Alerts') || selection.label.includes('Enable Phone Alerts')) {
        await vscode.commands.executeCommand('heyhuman.togglePhoneAlerts');
      } else if (selection.label.includes('Unmute Alerts')) {
        await vscode.commands.executeCommand('heyhuman.unmute');
      } else if (selection.label.includes('Mute Temporarily')) {
        await vscode.commands.executeCommand('heyhuman.muteTemporarily');
      } else if (selection.label.includes('Test Sound')) {
        await vscode.commands.executeCommand('heyhuman.testSound');
      } else if (selection.label.includes('Enable Antigravity Mobile Approvals')) {
        await vscode.commands.executeCommand('heyhuman.setupAntigravityHook');
      } else if (selection.label.includes('Detection Status')) {
        await vscode.commands.executeCommand('heyhuman.showStatus');
      } else if (selection.label.includes('Pair Web Alert Room')) {
        await vscode.commands.executeCommand('heyhuman.setWebRoom');
      } else if (selection.label.includes('Configure Settings')) {
        await vscode.commands.executeCommand('heyhuman.openSettings');
      }
    })
  );
}
