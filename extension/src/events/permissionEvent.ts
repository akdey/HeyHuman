/**
 * HeyHuman - Permission Event Types
 * Defines normalized event models for AI agent permission requests.
 */

export type AgentType = 'copilot' | 'antigravity' | 'claude' | 'cursor' | 'aider' | 'custom';

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

export interface QuestionOptionItem {
  question: string;
  options: string[];
  isMultiSelect?: boolean;
}

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
  /** Structured questions if this is an interactive questionnaire */
  questions?: QuestionOptionItem[];
  /** Flat list of available option labels (e.g. ["Option 1", "Option 2"]) */
  options?: string[];
  /** Whether the user can write a custom response */
  allowCustomInput?: boolean;
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
