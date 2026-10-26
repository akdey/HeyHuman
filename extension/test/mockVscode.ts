// Lightweight VS Code API mock for unit testing outside VS Code runtime
const configStore: Record<string, any> = {
  'heyhuman.enabled': true,
  'heyhuman.agents.copilot.enabled': true,
  'heyhuman.agents.antigravity.enabled': true,
  'heyhuman.agents.claude.enabled': true,
  'heyhuman.agents.cursor.enabled': true,
  'heyhuman.agents.aider.enabled': true,
  'heyhuman.sound.enabled': true,
  'heyhuman.sound.type': 'siren',
  'heyhuman.sound.volume': 80,
  'heyhuman.sound.customSoundPath': '',
  'heyhuman.notifications.enabled': true,
  'heyhuman.notifications.focusWindowOnClick': true,
  'heyhuman.alerts.cooldownSeconds': 5,
  'heyhuman.alerts.temporaryMuteDurationMinutes': 15,
  'heyhuman.antigravity.customLogPath': '',
  'heyhuman.antigravity.companionPort': 47291,
  'heyhuman.copilot.customLogPath': '',
  'heyhuman.phoneAlerts.enabled': false
};

class EventEmitter<T> {
  private listeners: ((e: T) => any)[] = [];
  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T) {
    for (const l of this.listeners) {
      l(data);
    }
  }
  dispose() {
    this.listeners = [];
  }
}

export const mockVscode = {
  EventEmitter,
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  workspace: {
    getConfiguration: (section?: string) => ({
      get: <T>(key: string, defaultValue?: T): T => {
        const fullKey = section ? `${section}.${key}` : key;
        return fullKey in configStore ? configStore[fullKey] : (defaultValue as T);
      },
      update: async (key: string, value: any) => {
        const fullKey = section ? `${section}.${key}` : key;
        configStore[fullKey] = value;
      }
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} })
  },
  window: {
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      color: undefined,
      command: '',
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showQuickPick: async () => undefined
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => undefined
  },
  extensions: {
    getExtension: () => undefined
  }
};

// Register mock in require cache so any `import * as vscode from 'vscode'` resolves to this mock
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};
