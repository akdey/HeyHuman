/**
 * HeyHuman - Permission Event Types
 * Defines normalized event models for AI agent permission requests.
 */

export type AgentType = 'copilot' | 'antigravity' | 'custom';

export type PermissionType = 
  | 'terminal_command' 
  | 'tool_execution' 
  | 'confirmation_dialog' 
  | 'file_access' 
  | 'question_input'
  | 'other';

export type PermissionState = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'dismissed';

export interface PermissionEvent {
  /** Stable unique ID for this permission request */
  id: string;
  /** Agent requesting permission */
  agent: AgentType;
  /** Type of action requiring permission */
  type: PermissionType;
  /** Current state of the permission request */
  state: PermissionState;
  /** User-friendly summary of what is requesting approval */
  summary: string;
  /** Optional detailed action (e.g. command text or tool arguments) */
  details?: string;
  /** Epoch timestamp in ms when the event was detected */
  timestamp: number;
  /** Optional raw event metadata from detector */
  metadata?: Record<string, unknown>;
}

export interface PermissionResolutionEvent {
  id: string;
  agent: AgentType;
  state: 'approved' | 'rejected' | 'dismissed';
  timestamp: number;
}
