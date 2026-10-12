import * as vscode from 'vscode';
import { AgentType, PermissionEvent } from '../events/permissionEvent';

export type DetectorStatus = 'active' | 'idle' | 'warning' | 'error' | 'unsupported';

export interface DetectorStatusInfo {
  status: DetectorStatus;
  message: string;
  targetPath?: string;
}

export interface IAgentDetector extends vscode.Disposable {
  readonly id: AgentType;
  readonly name: string;
  start(): Promise<void>;
  stop(): void;
  getStatus(): DetectorStatusInfo;
  readonly onPermissionDetected: vscode.Event<PermissionEvent>;
  readonly onPermissionResolved: vscode.Event<{ id: string; agent: AgentType }>;
}
