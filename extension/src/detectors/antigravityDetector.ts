import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as crypto from 'crypto';
import { AgentType, PermissionEvent } from '../events/permissionEvent';
import { DetectorStatusInfo, IAgentDetector } from './detectorTypes';
import { SettingsManager } from '../config/settings';

export class AntigravityDetector implements IAgentDetector {
  public readonly id: AgentType = 'antigravity';
  public readonly name = 'Google Antigravity';

  private readonly permissionDetectedEmitter = new vscode.EventEmitter<PermissionEvent>();
  public readonly onPermissionDetected = this.permissionDetectedEmitter.event;

  private readonly permissionResolvedEmitter = new vscode.EventEmitter<{ id: string; agent: AgentType }>();
  public readonly onPermissionResolved = this.permissionResolvedEmitter.event;

  private settings = SettingsManager.getInstance();
  private isRunning = false;
  private watchedFiles = new Set<string>();
  private fileWatchers: fs.FSWatcher[] = [];
  private fileOffsets = new Map<string, number>();
  private pollTimer: NodeJS.Timeout | null = null;
  private companionServer: http.Server | null = null;
  private activePendingIds = new Set<string>();

  private statusInfo: DetectorStatusInfo = {
    status: 'idle',
    message: 'Initializing detector...'
  };

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // 1. Start companion server for local hooks/external integration
    this.startCompanionServer();

    // 2. Discover and monitor Antigravity brain transcripts
    this.scanAndWatchTranscripts();

    // 3. Robust polling timer (every 1000ms): scans directories AND polls all watched files for updates
    this.pollTimer = setInterval(() => {
      if (this.isRunning) {
        this.scanAndWatchTranscripts();
        this.pollAllWatchedFiles();
      }
    }, 1000);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const watcher of this.fileWatchers) {
      try {
        watcher.close();
      } catch {
        // Ignore
      }
    }
    this.fileWatchers = [];
    this.watchedFiles.clear();
    this.fileOffsets.clear();
    this.activePendingIds.clear();
    this.recentActions = [];

    if (this.companionServer) {
      try {
        this.companionServer.close();
      } catch {
        // Ignore
      }
      this.companionServer = null;
    }

    this.statusInfo = {
      status: 'idle',
      message: 'Stopped'
    };
  }

  public getStatus(): DetectorStatusInfo {
    return this.statusInfo;
  }

  /**
   * Starts a lightweight local HTTP bridge for external Antigravity sessions/scripts.
   */
  private recentActions: Array<{ id?: string; action: string; timestamp: number }> = [];

  private startCompanionServer(): void {
    const port = this.settings.getAntigravityCompanionPort();
    try {
      this.companionServer = http.createServer((req, res) => {
        const rawUrl = req.url || '';
        const method = req.method || 'GET';
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');

        if (method === 'GET' && (parsedUrl.pathname === '/' || parsedUrl.pathname === '/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            service: 'HeyHuman Antigravity Companion',
            room: this.settings.getWebRoom(),
            pendingCount: this.activePendingIds.size
          }));
          return;
        }

        if (method === 'GET' && parsedUrl.pathname === '/action') {
          const reqId = parsedUrl.searchParams.get('id');
          const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);

          const matched = this.recentActions.find(a => {
            const timeOk = a.timestamp >= since;
            if (!timeOk) return false;
            if (!reqId || !a.id) return true;
            return a.id === reqId || reqId.includes(a.id) || a.id.includes(reqId);
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            action: matched ? matched.action : null,
            id: matched ? matched.id : null,
            timestamp: matched ? matched.timestamp : null
          }));
          return;
        }

        if (method === 'POST' && parsedUrl.pathname === '/action') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              this.recordRemoteAction({
                id: data.id,
                action: data.action || 'approve',
                timestamp: data.timestamp || Date.now()
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Action recorded' }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
          });
          return;
        }

        if (method === 'POST' && parsedUrl.pathname === '/alert') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const eventId = data.id || `ag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              this.activePendingIds.add(eventId);

              const event: PermissionEvent = {
                id: eventId,
                agent: 'antigravity',
                type: data.type || 'confirmation_dialog',
                state: 'pending',
                summary: data.summary || 'Antigravity permission prompt waiting for response',
                details: data.details,
                timestamp: Date.now(),
                metadata: data.metadata
              };
              this.permissionDetectedEmitter.fire(event);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, id: event.id }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
          });
          return;
        }

        if (method === 'POST' && parsedUrl.pathname === '/resolve') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.id) {
                this.activePendingIds.delete(data.id);
                this.permissionResolvedEmitter.fire({
                  id: data.id,
                  agent: 'antigravity'
                });
              } else {
                this.resolveAllPending();
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.companionServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[HeyHuman] Antigravity companion port ${port} already in use. Transcripts watcher active.`);
        } else {
          console.warn('[HeyHuman] Companion server error:', err);
        }
      });

      this.companionServer.listen(port, '127.0.0.1', () => {
        console.log(`[HeyHuman] Antigravity companion listening on http://127.0.0.1:${port}`);
      });
    } catch (err) {
      console.warn('[HeyHuman] Failed to start companion server:', err);
    }
  }

  /**
   * Scans for Antigravity conversation transcript files.
   */
  private scanAndWatchTranscripts(): void {
    const brainDirs = this.getBrainDirectories();
    let transcriptCount = 0;

    for (const brainDir of brainDirs) {
      if (!fs.existsSync(brainDir)) {
        continue;
      }

      try {
        const convFolders = fs.readdirSync(brainDir);
        for (const folder of convFolders) {
          const logDir = path.join(brainDir, folder, '.system_generated', 'logs');
          if (fs.existsSync(logDir)) {
            const transcriptFile = path.join(logDir, 'transcript.jsonl');
            if (fs.existsSync(transcriptFile)) {
              this.watchSingleTranscript(transcriptFile);
              transcriptCount++;
            }
          }
        }
      } catch {
        // Path might be restricted
      }
    }

    if (transcriptCount > 0 || this.watchedFiles.size > 0) {
      this.statusInfo = {
        status: 'active',
        message: `Actively watching ${this.watchedFiles.size} Antigravity transcript(s) & companion port ${this.settings.getAntigravityCompanionPort()}`
      };
    } else {
      const isAntigravityInstalled =
        fs.existsSync('/Applications/Antigravity IDE.app') ||
        fs.existsSync('/Applications/Antigravity.app') ||
        fs.existsSync(path.join(os.homedir(), '.gemini', 'antigravity'));

      this.statusInfo = {
        status: isAntigravityInstalled ? 'idle' : 'warning',
        message: isAntigravityInstalled
          ? `Antigravity detected (companion port ${this.settings.getAntigravityCompanionPort()}; waiting for conversation)`
          : 'Google Antigravity not found in default paths. Configure a custom path in settings.'
      };
    }
  }

  private getBrainDirectories(): string[] {
    const list: string[] = [];

    const custom = this.settings.getAntigravityCustomLogPath();
    if (custom) {
      list.push(custom);
    }

    const defaultBrain = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    list.push(defaultBrain);

    return list;
  }

  private watchSingleTranscript(filePath: string): void {
    if (this.watchedFiles.has(filePath)) {
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      this.fileOffsets.set(filePath, stats.size);
      this.watchedFiles.add(filePath);

      const watcher = fs.watch(filePath, () => {
        this.readNewTranscriptLines(filePath);
      });

      watcher.on('error', () => {
        this.watchedFiles.delete(filePath);
      });

      this.fileWatchers.push(watcher);
    } catch {
      // Skip locked/unreadable file
    }
  }

  /**
   * Proactively polls all watched files to avoid missing events if fs.watch drops on macOS.
   */
  private pollAllWatchedFiles(): void {
    for (const filePath of this.watchedFiles) {
      this.readNewTranscriptLines(filePath);
    }
  }

  private readNewTranscriptLines(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }
      const stats = fs.statSync(filePath);
      const prevOffset = this.fileOffsets.get(filePath) || 0;

      if (stats.size < prevOffset) {
        // File was truncated or restarted
        this.fileOffsets.set(filePath, 0);
        return;
      }

      if (stats.size === prevOffset) {
        return;
      }

      const length = stats.size - prevOffset;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, length, prevOffset);
      fs.closeSync(fd);

      this.fileOffsets.set(filePath, stats.size);
      const chunk = buffer.toString('utf-8');
      this.parseTranscriptChunk(chunk, filePath);
    } catch (err) {
      console.warn(`[HeyHuman] Error reading transcript from ${filePath}:`, err);
    }
  }

  public parseTranscriptChunk(chunk: string, sourcePath: string): void {
    const lines = chunk.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      try {
        const step = JSON.parse(line);
        this.evaluateStep(step, sourcePath);
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  public evaluateStep(step: any, sourcePath: string): void {
    const stepIndex = step.step_index ?? 0;
    const stepStatus = String(step.status || '').toUpperCase();
    const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];

    // 1. Check for `ask_question` tool call
    const askQuestionCall = toolCalls.find((t: any) => t.name === 'ask_question');
    if (askQuestionCall) {
      const qArgs = askQuestionCall.args || {};
      let parsedQuestions: Array<{ question: string; options: string[]; isMultiSelect?: boolean }> = [];

      if (Array.isArray(qArgs.questions)) {
        parsedQuestions = qArgs.questions.map((q: any) => ({
          question: q.question || 'Please select an option',
          options: Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [],
          isMultiSelect: !!q.is_multi_select
        }));
      } else if (qArgs.question) {
        parsedQuestions = [{
          question: String(qArgs.question),
          options: Array.isArray(qArgs.options) ? qArgs.options.map((o: any) => String(o)) : [],
          isMultiSelect: !!qArgs.is_multi_select
        }];
      }

      const firstQ = parsedQuestions[0];
      const summaryText = firstQ ? firstQ.question.slice(0, 100) : 'User clarification requested';
      const flatOptions = firstQ ? firstQ.options : [];

      const id = `ag-step-${stepIndex}-q`;
      this.activePendingIds.add(id);

      const event: PermissionEvent = {
        id,
        agent: 'antigravity',
        type: 'question_input',
        state: 'pending',
        summary: summaryText,
        details: JSON.stringify(qArgs),
        questions: parsedQuestions,
        options: flatOptions,
        allowCustomInput: true,
        timestamp: Date.now(),
        metadata: { stepIndex, sourcePath }
      };

      this.permissionDetectedEmitter.fire(event);
      return;
    }

    // 2. Check for `run_command` with `BypassSandbox: true`
    const bypassCall = toolCalls.find(
      (t: any) => t.name === 'run_command' && (t.args?.BypassSandbox === true || t.args?.BypassSandbox === 'true')
    );
    if (bypassCall) {
      const cmd = bypassCall.args?.CommandLine || 'terminal command';
      const cleanCmd = String(cmd).replace(/^"|"$/g, '').slice(0, 80);

      const id = `ag-step-${stepIndex}-bypass`;
      this.activePendingIds.add(id);

      const event: PermissionEvent = {
        id,
        agent: 'antigravity',
        type: 'terminal_command',
        state: 'pending',
        summary: `Terminal Permission: ${cleanCmd}`,
        details: String(cmd),
        options: ['Allow Once', 'Always Allow', 'Deny'],
        allowCustomInput: false,
        timestamp: Date.now(),
        metadata: { stepIndex, sourcePath }
      };

      this.permissionDetectedEmitter.fire(event);
      return;
    }

    // 3. Step status check (waiting for input/permission)
    if (stepStatus.includes('WAITING') || stepStatus.includes('PERMISSION') || stepStatus === 'WAITING_FOR_INPUT') {
      const id = `ag-step-${stepIndex}-waiting`;
      this.activePendingIds.add(id);

      const event: PermissionEvent = {
        id,
        agent: 'antigravity',
        type: 'confirmation_dialog',
        state: 'pending',
        summary: 'Antigravity action awaiting user approval',
        options: ['Approve (y)', 'Reject (n)'],
        allowCustomInput: true,
        timestamp: Date.now(),
        metadata: { stepIndex, sourcePath }
      };

      this.permissionDetectedEmitter.fire(event);
      return;
    }

    // 4. Resolution check: If step is completed or user explicit input occurred
    if (step.source === 'USER_EXPLICIT' || step.source === 'USER_INPUT' || stepStatus === 'DONE') {
      this.resolveAllPending();
    }
  }

  private resolveAllPending(): void {
    if (this.activePendingIds.size === 0) {
      this.permissionResolvedEmitter.fire({
        id: 'ag-all',
        agent: 'antigravity'
      });
      return;
    }
    for (const pendingId of this.activePendingIds) {
      this.permissionResolvedEmitter.fire({
        id: pendingId,
        agent: 'antigravity'
      });
    }
    this.activePendingIds.clear();
  }

  public recordRemoteAction(action: { id?: string; action: string; timestamp?: number }): void {
    const timestamp = action.timestamp || Date.now();
    this.recentActions.unshift({ id: action.id, action: action.action, timestamp });
    if (this.recentActions.length > 50) {
      this.recentActions.pop();
    }
    if (action.id) {
      this.activePendingIds.delete(action.id);
      this.permissionResolvedEmitter.fire({
        id: action.id,
        agent: 'antigravity'
      });
    } else {
      this.resolveAllPending();
    }
  }

  /**
   * Automatically configures .agents/hooks.json and .agents/scripts/heyhuman-hook.js
   * in the user's workspace so Antigravity approvals flow seamlessly from mobile.
   */
  public async setupWorkspaceHook(): Promise<boolean> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage('HeyHuman: Open a workspace or project folder first to install the Antigravity hook.');
      return false;
    }

    const rootPath = folders[0].uri.fsPath;
    const agentsDir = path.join(rootPath, '.agents');
    const scriptsDir = path.join(agentsDir, 'scripts');
    const hooksJsonPath = path.join(agentsDir, 'hooks.json');
    const hookScriptPath = path.join(scriptsDir, 'heyhuman-hook.js');

    try {
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      const hooksConfig = {
        'heyhuman-approval': {
          enabled: true,
          PreToolUse: [
            {
              matcher: 'run_command',
              hooks: [
                {
                  type: 'command',
                  command: 'node scripts/heyhuman-hook.js',
                  timeout: 45
                }
              ]
            }
          ]
        }
      };

      fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2), 'utf-8');

      // Hook script contents
      const hookScriptCode = `#!/usr/bin/env node
/**
 * HeyHuman Antigravity Lifecycle Hook
 * Intercepts tool calls (e.g. run_command with BypassSandbox: true).
 * When approval is required:
 *   1. Emits alert to HeyHuman companion and mobile room.
 *   2. Waits up to 35s for mobile action (Approve / Reject).
 *   3. If approved via phone: outputs { "decision": "allow" } -> Antigravity runs immediately!
 *   4. If rejected via phone: outputs { "decision": "deny" } -> Antigravity cancels tool.
 *   5. If timeout reached: outputs { "decision": "ask" } -> Falls back to desktop prompt.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const COMPANION_PORT = 47291;
const DEFAULT_ENDPOINT = 'https://hey-human-akdey.vercel.app';
const TIMEOUT_SECONDS = 35;

async function main() {
  let inputRaw = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    inputRaw += chunk;
  }

  let payload = {};
  try {
    payload = JSON.parse(inputRaw || '{}');
  } catch {
    outputDecision('ask', 'Could not parse hook input');
    return;
  }

  const toolCall = payload.toolCall || {};
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};
  const stepIdx = payload.stepIdx ?? 0;

  const isBypass = args.BypassSandbox === true || args.BypassSandbox === 'true';
  const cmdStr = (args.CommandLine || '').toLowerCase();
  const isDestructive = cmdStr.includes('rm -rf') || cmdStr.includes('git reset --hard') || cmdStr.includes('npm publish') || cmdStr.includes('drop database');
  const isSensitive = isBypass || toolName === 'ask_question' || isDestructive;

  if (!isSensitive) {
    outputDecision('allow');
    return;
  }

  const commandStr = args.CommandLine || toolName;
  const alertId = \`ag-step-\${stepIdx}-hook-\${Date.now()}\`;

  let room = process.env.HEYHUMAN_ROOM || '';
  if (!room) {
    try {
      const companionStatus = await httpGetJson(\`http://127.0.0.1:\${COMPANION_PORT}/status\`);
      if (companionStatus && companionStatus.room) {
        room = companionStatus.room;
      }
    } catch {}
  }

  if (!room) {
    try {
      const settingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        room = s['heyhuman.webRoom'] || '';
      }
    } catch {}
  }

  if (!room) {
    room = 'orbit-swift-551';
  }

  const alertPayload = {
    id: alertId,
    agent: 'ANTIGRAVITY',
    type: 'Permission Request',
    tool: toolName,
    command: String(commandStr).slice(0, 150),
    description: \`Antigravity wants to run: \${String(commandStr).slice(0, 100)}\`,
    timestamp: Date.now()
  };

  httpPostJson(\`http://127.0.0.1:\${COMPANION_PORT}/alert\`, alertPayload).catch(() => {});

  const webUrl = \`\${DEFAULT_ENDPOINT}/api/alert?room=\${encodeURIComponent(room)}\`;
  await httpPostJson(webUrl, alertPayload).catch(() => {});

  const startTime = Date.now();
  const maxWaitMs = TIMEOUT_SECONDS * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(600);

    try {
      const compRes = await httpGetJson(\`http://127.0.0.1:\${COMPANION_PORT}/action?id=\${encodeURIComponent(alertId)}&since=\${startTime}\`);
      if (compRes && compRes.action) {
        if (compRes.action === 'approve') {
          outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
          return;
        } else if (compRes.action === 'reject') {
          outputDecision('deny', 'Rejected remotely via HeyHuman mobile app');
          return;
        }
      }
    } catch {}

    try {
      const pollUrl = \`\${DEFAULT_ENDPOINT}/api/alert?room=\${encodeURIComponent(room)}&since=\${startTime - 1000}\`;
      const webRes = await httpGetJson(pollUrl);
      if (webRes && Array.isArray(webRes.actions)) {
        for (const act of webRes.actions) {
          if (act.timestamp >= startTime) {
            if (act.action === 'approve') {
              outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
              return;
            } else if (act.action === 'reject') {
              outputDecision('deny', 'Rejected remotely via HeyHuman mobile app');
              return;
            }
          }
        }
      }
    } catch {}
  }

  outputDecision('ask', 'No mobile response received within timeout. Falling back to desktop prompt.');
}

function outputDecision(decision, reason) {
  const result = { decision };
  if (reason) result.reason = reason;
  process.stdout.write(JSON.stringify(result) + '\\n');
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(urlStr, { timeout: 3000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPostJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const client = isHttps ? https : http;
    const bodyStr = JSON.stringify(bodyObj);
    const parsed = new URL(urlStr);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: 4000
    };

    const req = client.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

main().catch(() => {
  outputDecision('ask', 'Hook error');
});
`;

      fs.writeFileSync(hookScriptPath, hookScriptCode, 'utf-8');

      if (process.platform !== 'win32' && fs.existsSync(hookScriptPath)) {
        try {
          fs.chmodSync(hookScriptPath, 0o755);
        } catch {}
      }

      vscode.window.showInformationMessage('🚀 HeyHuman: Antigravity Mobile Approval Hook installed in .agents/hooks.json! Approvals from your phone will now auto-execute.');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`HeyHuman: Failed to install hook: ${err?.message || err}`);
      return false;
    }
  }

  public dispose(): void {
    this.stop();
    this.permissionDetectedEmitter.dispose();
    this.permissionResolvedEmitter.dispose();
  }
}
