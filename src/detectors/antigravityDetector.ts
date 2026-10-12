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
  private startCompanionServer(): void {
    const port = this.settings.getAntigravityCompanionPort();
    try {
      this.companionServer = http.createServer((req, res) => {
        const url = req.url || '';
        const method = req.method || 'GET';

        if (method === 'GET' && (url === '/' || url === '/status')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', service: 'HeyHuman Antigravity Companion' }));
          return;
        }

        if (method === 'POST' && url === '/alert') {
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

        if (method === 'POST' && url === '/resolve') {
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
      const questionData = askQuestionCall.args?.questions || askQuestionCall.args?.question || '';
      const summaryText = typeof questionData === 'string' && questionData
        ? questionData.slice(0, 80)
        : 'User clarification requested';

      const id = `ag-step-${stepIndex}-q`;
      this.activePendingIds.add(id);

      const event: PermissionEvent = {
        id,
        agent: 'antigravity',
        type: 'question_input',
        state: 'pending',
        summary: `Question: ${summaryText}`,
        details: JSON.stringify(askQuestionCall.args),
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

  public dispose(): void {
    this.stop();
    this.permissionDetectedEmitter.dispose();
    this.permissionResolvedEmitter.dispose();
  }
}
