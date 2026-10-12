import './mockVscode';
import * as assert from 'assert';
import { CopilotDetector } from '../src/detectors/copilotDetector';
import { AntigravityDetector } from '../src/detectors/antigravityDetector';
import { ClaudeDetector } from '../src/detectors/claudeDetector';
import { CursorDetector } from '../src/detectors/cursorDetector';
import { AiderDetector } from '../src/detectors/aiderDetector';
import { PermissionEvent } from '../src/events/permissionEvent';

describe('Agent Detectors', () => {
  describe('CopilotDetector', () => {
    let detector: CopilotDetector;
    let detectedEvents: PermissionEvent[] = [];
    let resolvedEvents: { id: string; agent: string }[] = [];

    beforeEach(() => {
      detectedEvents = [];
      resolvedEvents = [];
      const mockContext = {
        extensionPath: '/mock/path',
        storageUri: { fsPath: '/mock/storage' },
        globalStorageUri: { fsPath: '/mock/globalStorage' }
      } as any;

      detector = new CopilotDetector(mockContext);
      detector.onPermissionDetected(e => detectedEvents.push(e));
      detector.onPermissionResolved(e => resolvedEvents.push(e));
    });

    afterEach(() => {
      detector.dispose();
    });

    it('detects confirmation prompt for terminal command execution', () => {
      const logLine = '2026-10-12 [INFO] chat: terminal command confirmation required for action: "npm run build"';
      detector.analyzeLogChunk(logLine, '/fake/path/copilot.log');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'copilot');
      assert.strictEqual(detectedEvents[0].type, 'terminal_command');
      assert.ok(detectedEvents[0].summary.includes('npm run build'));
    });

    it('detects tool execution confirmation prompt', () => {
      const logLine = '2026-10-12 [INFO] prepareInvocation: confirmation requested for tool: "file_writer"';
      detector.analyzeLogChunk(logLine, '/fake/path/copilot.log');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'copilot');
      assert.strictEqual(detectedEvents[0].type, 'tool_execution');
      assert.ok(detectedEvents[0].summary.includes('file_writer'));
    });

    it('ignores ordinary chat streaming text and progress lines', () => {
      const chunk = `
        2026-10-12 [INFO] Model stream chunk received: "Let me check the files..."
        2026-10-12 [INFO] Generating solution for user prompt...
        2026-10-12 [INFO] Task finished successfully.
      `;
      detector.analyzeLogChunk(chunk, '/fake/path/copilot.log');
      assert.strictEqual(detectedEvents.length, 0);
    });

    it('detects user resolution when action is approved or cancelled', () => {
      const resolutionLine = '2026-10-12 [INFO] confirmation approved by user for tool: "file_writer"';
      detector.analyzeLogChunk(resolutionLine, '/fake/path/copilot.log');

      assert.strictEqual(resolvedEvents.length, 1);
      assert.strictEqual(resolvedEvents[0].agent, 'copilot');
    });
  });

  describe('AntigravityDetector', () => {
    let detector: AntigravityDetector;
    let detectedEvents: PermissionEvent[] = [];
    let resolvedEvents: { id: string; agent: string }[] = [];

    beforeEach(() => {
      detectedEvents = [];
      resolvedEvents = [];
      detector = new AntigravityDetector();
      detector.onPermissionDetected(e => detectedEvents.push(e));
      detector.onPermissionResolved(e => resolvedEvents.push(e));
    });

    afterEach(() => {
      detector.dispose();
    });

    it('detects ask_question interactive prompt in transcript step', () => {
      const step = {
        step_index: 12,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [
          {
            name: 'ask_question',
            args: {
              questions: [
                {
                  question: 'Which test framework do you want to use?',
                  options: ['Mocha', 'Jest']
                }
              ]
            }
          }
        ]
      };

      detector.evaluateStep(step, '/mock/transcript.jsonl');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'antigravity');
      assert.strictEqual(detectedEvents[0].type, 'question_input');
      assert.ok(detectedEvents[0].summary.includes('Question:'));
    });

    it('detects BypassSandbox command requiring explicit user permission', () => {
      const step = {
        step_index: 15,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [
          {
            name: 'run_command',
            args: {
              CommandLine: 'npm install --save-dev mocha',
              BypassSandbox: true
            }
          }
        ]
      };

      detector.evaluateStep(step, '/mock/transcript.jsonl');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'antigravity');
      assert.strictEqual(detectedEvents[0].type, 'terminal_command');
      assert.ok(detectedEvents[0].summary.includes('Terminal Permission: npm install --save-dev mocha'));
    });

    it('ignores ordinary sandboxed tool commands', () => {
      const step = {
        step_index: 16,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [
          {
            name: 'run_command',
            args: {
              CommandLine: 'ls -la',
              BypassSandbox: false
            }
          }
        ]
      };

      detector.evaluateStep(step, '/mock/transcript.jsonl');
      assert.strictEqual(detectedEvents.length, 0);
    });

    it('detects step status WAITING_FOR_INPUT', () => {
      const step = {
        step_index: 20,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'WAITING_FOR_INPUT',
        tool_calls: []
      };

      detector.evaluateStep(step, '/mock/transcript.jsonl');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'antigravity');
      assert.strictEqual(detectedEvents[0].type, 'confirmation_dialog');
    });

    it('handles resolution when user answers or step completes', () => {
      const step = {
        step_index: 20,
        source: 'USER_INPUT',
        type: 'USER_RESPONSE',
        status: 'DONE'
      };

      detector.evaluateStep(step, '/mock/transcript.jsonl');

      assert.strictEqual(resolvedEvents.length, 1);
      assert.strictEqual(resolvedEvents[0].agent, 'antigravity');
    });

    it('safely ignores invalid JSON chunks without throwing', () => {
      assert.doesNotThrow(() => {
        detector.parseTranscriptChunk('not valid json\n{partial\n', '/mock/transcript.jsonl');
      });
      assert.strictEqual(detectedEvents.length, 0);
    });
  });

  describe('ClaudeDetector', () => {
    let detector: ClaudeDetector;
    let detectedEvents: PermissionEvent[] = [];
    let resolvedEvents: { id: string; agent: string }[] = [];

    beforeEach(() => {
      detectedEvents = [];
      resolvedEvents = [];
      detector = new ClaudeDetector();
      detector.onPermissionDetected(e => detectedEvents.push(e));
      detector.onPermissionResolved(e => resolvedEvents.push(e));
    });

    afterEach(() => {
      detector.dispose();
    });

    it('detects Claude Code command approval prompt', () => {
      const line = 'Claude wants to execute bash command: "npm test". Do you want to run this command? [Y/n]';
      detector.analyzeLogChunk(line, '/mock/claude.log');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'claude');
      assert.strictEqual(detectedEvents[0].type, 'terminal_command');
      assert.ok(detectedEvents[0].summary.includes('Approve'));
    });

    it('detects resolution when command completes or user confirms', () => {
      detector.analyzeLogChunk('Do you want to run this command? [y/n]', '/mock/claude.log');
      assert.strictEqual(detectedEvents.length, 1);

      detector.analyzeLogChunk('command executed successfully', '/mock/claude.log');
      assert.strictEqual(resolvedEvents.length, 1);
      assert.strictEqual(resolvedEvents[0].agent, 'claude');
    });
  });

  describe('CursorDetector', () => {
    let detector: CursorDetector;
    let detectedEvents: PermissionEvent[] = [];
    let resolvedEvents: { id: string; agent: string }[] = [];

    beforeEach(() => {
      detectedEvents = [];
      resolvedEvents = [];
      detector = new CursorDetector();
      detector.onPermissionDetected(e => detectedEvents.push(e));
      detector.onPermissionResolved(e => resolvedEvents.push(e));
    });

    afterEach(() => {
      detector.dispose();
    });

    it('detects Cursor Agent confirmation prompt', () => {
      const line = 'cursor: waiting for approval to run in terminal action="make build"';
      detector.analyzeLogChunk(line, '/mock/cursor.log');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'cursor');
      assert.strictEqual(detectedEvents[0].type, 'terminal_command');
    });

    it('detects Cursor permission resolution', () => {
      detector.analyzeLogChunk('cursor: waiting for approval to execute tool', '/mock/cursor.log');
      assert.strictEqual(detectedEvents.length, 1);

      detector.analyzeLogChunk('cursor: user approved action', '/mock/cursor.log');
      assert.strictEqual(resolvedEvents.length, 1);
      assert.strictEqual(resolvedEvents[0].agent, 'cursor');
    });
  });

  describe('AiderDetector', () => {
    let detector: AiderDetector;
    let detectedEvents: PermissionEvent[] = [];
    let resolvedEvents: { id: string; agent: string }[] = [];

    beforeEach(() => {
      detectedEvents = [];
      resolvedEvents = [];
      detector = new AiderDetector();
      detector.onPermissionDetected(e => detectedEvents.push(e));
      detector.onPermissionResolved(e => resolvedEvents.push(e));
    });

    afterEach(() => {
      detector.dispose();
    });

    it('detects Aider shell command execution prompt', () => {
      const line = 'Run shell command? (Y)es/(N)o [Yes]: `git commit -m "update"`';
      detector.analyzeLogChunk(line, '/mock/.aider.chat.history.md');

      assert.strictEqual(detectedEvents.length, 1);
      assert.strictEqual(detectedEvents[0].agent, 'aider');
      assert.strictEqual(detectedEvents[0].type, 'terminal_command');
      assert.ok(detectedEvents[0].summary.includes('Aider'));
    });

    it('detects Aider resolution when changes are applied', () => {
      detector.analyzeLogChunk('Apply changes? (Y)es/(N)o [Yes]:', '/mock/.aider.chat.history.md');
      assert.strictEqual(detectedEvents.length, 1);

      detector.analyzeLogChunk('Applied changes to src/file.ts', '/mock/.aider.chat.history.md');
      assert.strictEqual(resolvedEvents.length, 1);
      assert.strictEqual(resolvedEvents[0].agent, 'aider');
    });
  });
});
