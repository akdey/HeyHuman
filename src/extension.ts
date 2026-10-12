import * as vscode from 'vscode';
import { SettingsManager } from './config/settings';
import { AudioPlayer } from './alerts/audioPlayer';
import { NotificationManager } from './alerts/notificationManager';
import { AlertManager } from './alerts/alertManager';
import { PermissionTracker } from './events/permissionTracker';
import { CopilotDetector } from './detectors/copilotDetector';
import { AntigravityDetector } from './detectors/antigravityDetector';
import { StatusBarController } from './ui/statusBar';
import { registerCommands } from './ui/commands';
import { IAgentDetector } from './detectors/detectorTypes';

let statusBarController: StatusBarController | undefined;
let alertManagerInstance: AlertManager | undefined;
let detectors: IAgentDetector[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[HeyHuman] Activating HeyHuman extension...');

  const settings = SettingsManager.getInstance();

  // 1. Initialize Alert Pipeline
  const audioPlayer = new AudioPlayer({
    extensionPath: context.extensionPath
  });
  context.subscriptions.push({
    dispose: () => audioPlayer.dispose()
  });

  const notificationManager = new NotificationManager();
  const alertManager = new AlertManager({
    audioPlayer,
    notificationManager
  });
  alertManagerInstance = alertManager;
  context.subscriptions.push({
    dispose: () => alertManager.dispose()
  });

  const outputChannel = vscode.window.createOutputChannel('HeyHuman');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('[HeyHuman] Output channel initialized.');

  // 2. Initialize Permission Tracker
  const tracker = new PermissionTracker();

  // 3. Initialize Detectors
  const copilotDetector = new CopilotDetector(context);
  const antigravityDetector = new AntigravityDetector();
  detectors = [copilotDetector, antigravityDetector];

  for (const detector of detectors) {
    context.subscriptions.push(detector);

    // Permission detection pipeline
    detector.onPermissionDetected(async (event) => {
      outputChannel.appendLine(`[HeyHuman] Event detected from ${event.agent}: ${event.summary} (ID: ${event.id})`);
      const result = tracker.processEvent(event);
      if (result.isNewAlert) {
        outputChannel.appendLine(`[HeyHuman] 🔊 Triggering alert for request ID: ${event.id}`);
        await alertManager.triggerAlert(event);
      } else {
        outputChannel.appendLine(`[HeyHuman] Suppressed alert (${result.reason}) for request ID: ${event.id}`);
      }
    });

    // Permission resolution pipeline
    detector.onPermissionResolved((res) => {
      outputChannel.appendLine(`[HeyHuman] Request resolved: ${res.id}`);
      if (res.id.includes('all')) {
        tracker.resolveAllForAgent(res.agent);
      } else {
        tracker.resolveRequest({
          id: res.id,
          agent: res.agent,
          state: 'approved',
          timestamp: Date.now()
        });
      }
    });

    // Start detector
    detector.start().catch((err) => {
      console.warn(`[HeyHuman] Failed to start detector for ${detector.name}:`, err);
    });
  }

  // 4. Status Bar
  statusBarController = new StatusBarController(detectors);
  context.subscriptions.push(statusBarController);

  // 5. Commands
  registerCommands(context, alertManager, detectors);

  console.log('[HeyHuman] Extension activated successfully.');
}

export function deactivate(): void {
  console.log('[HeyHuman] Deactivating extension...');
  if (statusBarController) {
    statusBarController.dispose();
  }
  if (alertManagerInstance) {
    alertManagerInstance.dispose();
  }
  for (const d of detectors) {
    d.stop();
  }
}
