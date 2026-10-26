import './mockVscode';
import * as assert from 'assert';
import { AlertManager } from '../src/alerts/alertManager';
import { AudioPlayer } from '../src/alerts/audioPlayer';
import { NotificationManager } from '../src/alerts/notificationManager';
import { SettingsManager } from '../src/config/settings';
import { PermissionEvent } from '../src/events/permissionEvent';

class MockAudioPlayer extends AudioPlayer {
  public playCount = 0;
  public lastSoundType = '';
  public lastVolume = 0;
  public shouldFail = false;

  constructor() {
    super({ extensionPath: '/mock/path' });
  }

  public override async playSound(soundType: any, volume = 80, customPath?: string): Promise<boolean> {
    if (this.shouldFail) {
      return false;
    }
    this.playCount++;
    this.lastSoundType = soundType;
    this.lastVolume = volume;
    return true;
  }
}

class MockNotificationManager extends NotificationManager {
  public notifyCount = 0;
  public override async showPermissionNotification(event: PermissionEvent): Promise<void> {
    this.notifyCount++;
  }
}

describe('AlertManager', () => {
  let alertManager: AlertManager;
  let mockAudio: MockAudioPlayer;
  let mockNotification: MockNotificationManager;
  let settings: SettingsManager;

  beforeEach(async () => {
    settings = SettingsManager.getInstance();
    await settings.setEnabled(true);
    await settings.setAgentEnabled('copilot', true);
    await settings.setAgentEnabled('antigravity', true);
    settings.unmute();

    mockAudio = new MockAudioPlayer();
    mockNotification = new MockNotificationManager();
    alertManager = new AlertManager({
      audioPlayer: mockAudio,
      notificationManager: mockNotification
    });
  });

  afterEach(() => {
    alertManager.dispose();
  });

  it('triggers sound and notification when alert criteria are met', async () => {
    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Execute command',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, true);
    assert.strictEqual(mockAudio.playCount, 1);
    assert.strictEqual(mockNotification.notifyCount, 1);
  });

  it('suppresses alerts when master enabled toggle is false', async () => {
    await settings.setEnabled(false);

    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Execute command',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, false);
    assert.strictEqual(mockAudio.playCount, 0);
  });

  it('disabling Copilot alerts suppresses Copilot but does NOT suppress Antigravity', async () => {
    await settings.setAgentEnabled('copilot', false);
    await settings.setAgentEnabled('antigravity', true);

    const copilotEvent: PermissionEvent = {
      id: 'req-copilot',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Copilot command',
      timestamp: Date.now()
    };

    const antigravityEvent: PermissionEvent = {
      id: 'req-ag',
      agent: 'antigravity',
      type: 'question_input',
      state: 'pending',
      summary: 'Antigravity question',
      timestamp: Date.now()
    };

    const copilotTriggered = await alertManager.triggerAlert(copilotEvent);
    assert.strictEqual(copilotTriggered, false);
    assert.strictEqual(mockAudio.playCount, 0);

    const agTriggered = await alertManager.triggerAlert(antigravityEvent);
    assert.strictEqual(agTriggered, true);
    assert.strictEqual(mockAudio.playCount, 1);
  });

  it('disabling Antigravity alerts suppresses Antigravity but does NOT suppress Copilot', async () => {
    await settings.setAgentEnabled('copilot', true);
    await settings.setAgentEnabled('antigravity', false);

    const antigravityEvent: PermissionEvent = {
      id: 'req-ag',
      agent: 'antigravity',
      type: 'question_input',
      state: 'pending',
      summary: 'Antigravity question',
      timestamp: Date.now()
    };

    const copilotEvent: PermissionEvent = {
      id: 'req-copilot',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Copilot command',
      timestamp: Date.now()
    };

    const agTriggered = await alertManager.triggerAlert(antigravityEvent);
    assert.strictEqual(agTriggered, false);

    const copilotTriggered = await alertManager.triggerAlert(copilotEvent);
    assert.strictEqual(copilotTriggered, true);
    assert.strictEqual(mockAudio.playCount, 1);
  });

  it('suppresses alerts when temporary mute is active', async () => {
    settings.muteForMinutes(15);
    assert.strictEqual(settings.isMuted(), true);

    const event: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Execute command',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, false);
    assert.strictEqual(mockAudio.playCount, 0);

    settings.unmute();
    assert.strictEqual(settings.isMuted(), false);

    const triggeredAfterUnmute = await alertManager.triggerAlert(event);
    assert.strictEqual(triggeredAfterUnmute, true);
    assert.strictEqual(mockAudio.playCount, 1);
  });

  it('enforces alert cooldown between consecutive alerts', async () => {
    const event1: PermissionEvent = {
      id: 'req-1',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Execute command 1',
      timestamp: Date.now()
    };
    const event2: PermissionEvent = {
      id: 'req-2',
      agent: 'copilot',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Execute command 2',
      timestamp: Date.now()
    };

    const first = await alertManager.triggerAlert(event1);
    assert.strictEqual(first, true);

    // Immediate second event within cooldown (5s default)
    const second = await alertManager.triggerAlert(event2);
    assert.strictEqual(second, false);
    assert.strictEqual(mockAudio.playCount, 1);
  });

  it('allows manual sound testing without real permission request', async () => {
    const testResult = await alertManager.testSound();
    assert.strictEqual(testResult, true);
    assert.strictEqual(mockAudio.playCount, 1);
  });

  it('handles audio playback failure gracefully without throwing', async () => {
    mockAudio.shouldFail = true;
    const testResult = await alertManager.testSound();
    assert.strictEqual(testResult, false);
  });

  it('does NOT make network calls to web relay when phone alerts are disabled', async () => {
    await settings.setWebRoom('test-room');
    await settings.setPhoneAlertsEnabled(false);

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetchCalled = true;
      return { ok: true } as any;
    };

    try {
      const event: PermissionEvent = {
        id: 'phone-test-1',
        agent: 'antigravity',
        type: 'terminal_command',
        state: 'pending',
        summary: 'Antigravity run command',
        timestamp: Date.now()
      };

      const triggered = await alertManager.triggerAlert(event);
      assert.strictEqual(triggered, true);
      assert.strictEqual(fetchCalled, false, 'Fetch must not be called when phone alerts are disabled');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('dispatches web alert when phone alerts are enabled and web room is set', async () => {
    await settings.setWebRoom('test-room');
    await settings.setPhoneAlertsEnabled(true);

    let calledUrl = '';
    let calledBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts?: any) => {
      calledUrl = url;
      calledBody = opts && opts.body ? JSON.parse(opts.body) : null;
      return { ok: true } as any;
    };

    try {
      const event: PermissionEvent = {
        id: 'phone-test-2',
        agent: 'antigravity',
        type: 'terminal_command',
        state: 'pending',
        summary: 'Antigravity run command',
        timestamp: Date.now()
      };

      const triggered = await alertManager.triggerAlert(event);
      assert.strictEqual(triggered, true);
      assert.strictEqual(calledUrl.includes('/api/alert?room=test-room'), true);
      assert.strictEqual(calledBody?.id, 'phone-test-2');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('triggers alert and uses chime for code_finish when notifyOn.codeFinish is true', async () => {
    await settings.setNotifyOnCodeFinish(true);

    const event: PermissionEvent = {
      id: 'finish-test-1',
      agent: 'antigravity',
      type: 'code_finish',
      state: 'pending',
      summary: 'Task completed successfully',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, true);
    assert.strictEqual(mockAudio.playCount, 1);
    assert.strictEqual(mockAudio.lastSoundType, 'chime');
    assert.strictEqual(mockNotification.notifyCount, 1);
  });

  it('suppresses alert on code_finish when notifyOn.codeFinish is false', async () => {
    await settings.setNotifyOnCodeFinish(false);

    const event: PermissionEvent = {
      id: 'finish-test-2',
      agent: 'antigravity',
      type: 'code_finish',
      state: 'pending',
      summary: 'Task completed',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, false);
    assert.strictEqual(mockAudio.playCount, 0);
    assert.strictEqual(mockNotification.notifyCount, 0);
  });

  it('suppresses alert on permission request when notifyOn.permissionNeeded is false', async () => {
    await settings.setNotifyOnPermissionNeeded(false);

    const event: PermissionEvent = {
      id: 'perm-test-1',
      agent: 'antigravity',
      type: 'terminal_command',
      state: 'pending',
      summary: 'Run bash command',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, false);
    assert.strictEqual(mockAudio.playCount, 0);
  });

  it('triggers alert on task_error when notifyOn.taskError is true and suppresses when false', async () => {
    await settings.setNotifyOnTaskError(true);

    const event: PermissionEvent = {
      id: 'err-test-1',
      agent: 'antigravity',
      type: 'task_error',
      state: 'pending',
      summary: 'Tool execution failed',
      timestamp: Date.now()
    };

    const triggered = await alertManager.triggerAlert(event);
    assert.strictEqual(triggered, true);
    assert.strictEqual(mockNotification.notifyCount, 1);

    await settings.setNotifyOnTaskError(false);
    const event2: PermissionEvent = {
      id: 'err-test-2',
      agent: 'antigravity',
      type: 'task_error',
      state: 'pending',
      summary: 'Tool execution failed again',
      timestamp: Date.now() + 10000
    };
    const triggered2 = await alertManager.triggerAlert(event2);
    assert.strictEqual(triggered2, false);
  });
});
