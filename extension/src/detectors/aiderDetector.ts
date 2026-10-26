import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentType, PermissionEvent } from '../events/permissionEvent';
import { DetectorStatusInfo, IAgentDetector } from './detectorTypes';
import { SettingsManager } from '../config/settings';

export class AiderDetector implements IAgentDetector {
  public readonly id: AgentType = 'aider';
  public readonly name = 'Aider';

  private readonly permissionDetectedEmitter = new vscode.EventEmitter<PermissionEvent>();
  public readonly onPermissionDetected = this.permissionDetectedEmitter.event;

  private readonly permissionResolvedEmitter = new vscode.EventEmitter<{ id: string; agent: AgentType }>();
  public readonly onPermissionResolved = this.permissionResolvedEmitter.event;

  private settings = SettingsManager.getInstance();
  private fileWatchers: fs.FSWatcher[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private watchedFiles = new Set<string>();
  private fileOffsets = new Map<string, number>();
  private activePendingIds = new Set<string>();
  private eventSequence = 0;
  private isRunning = false;
  private statusInfo: DetectorStatusInfo = {
    status: 'idle',
    message: 'Initializing detector...'
  };

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    this.scanAndWatchTargets();

    this.pollTimer = setInterval(() => {
      if (this.isRunning) {
        this.scanAndWatchTargets();
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
    this.statusInfo = {
      status: 'idle',
      message: 'Stopped'
    };
  }

  public getStatus(): DetectorStatusInfo {
    return this.statusInfo;
  }

  private scanAndWatchTargets(): void {
    const candidates = this.getCandidatePaths();
    let anyActive = false;

    for (const targetPath of candidates) {
      if (!fs.existsSync(targetPath)) {
        continue;
      }

      try {
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(targetPath);
          for (const file of files) {
            const fullFilePath = path.join(targetPath, file);
            if (this.isAiderFile(fullFilePath)) {
              this.watchSingleFile(fullFilePath);
              anyActive = true;
            }
          }
        } else if (stats.isFile()) {
          this.watchSingleFile(targetPath);
          anyActive = true;
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (anyActive || this.watchedFiles.size > 0) {
      this.statusInfo = {
        status: 'active',
        message: `Actively monitoring ${this.watchedFiles.size} Aider chat history/log target(s)`
      };
    } else {
      this.statusInfo = {
        status: 'idle',
        message: 'Aider monitor ready; waiting for active .aider.chat.history.md'
      };
    }
  }

  private isAiderFile(filePath: string): boolean {
    const base = path.basename(filePath).toLowerCase();
    return base.includes('aider') || base.endsWith('.history.md');
  }

  private getCandidatePaths(): string[] {
    const paths: string[] = [];

    // Custom path
    const custom = this.settings.getAiderCustomLogPath();
    if (custom) {
      paths.push(custom);
    }

    // Workspace roots
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
        paths.push(path.join(wf.uri.fsPath, '.aider.chat.history.md'));
        paths.push(path.join(wf.uri.fsPath, '.aider.input.history'));
      }
    }

    // Default home location if configured
    paths.push(path.join(os.homedir(), '.aider.chat.history.md'));

    return paths;
  }

  private watchSingleFile(filePath: string): void {
    if (this.watchedFiles.has(filePath)) {
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      this.fileOffsets.set(filePath, stats.size);
      this.watchedFiles.add(filePath);

      const watcher = fs.watch(filePath, () => {
        this.readNewContent(filePath);
      });

      watcher.on('error', () => {
        this.watchedFiles.delete(filePath);
      });

      this.fileWatchers.push(watcher);
    } catch {
      // Ignore
    }
  }

  private pollAllWatchedFiles(): void {
    for (const filePath of this.watchedFiles) {
      this.readNewContent(filePath);
    }
  }

  private readNewContent(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }
      const stats = fs.statSync(filePath);
      const prevOffset = this.fileOffsets.get(filePath) || 0;

      if (stats.size < prevOffset) {
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
      this.analyzeLogChunk(chunk, filePath);
    } catch (err) {
      console.warn(`[HeyHuman] Error reading Aider log update from ${filePath}:`, err);
    }
  }

  public analyzeLogChunk(chunk: string, sourcePath: string): void {
    const lines = chunk.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const isApprovalRequest =
        /run\s+shell\s+command\?\s*\(y\)es\/\(n\)o|apply\s+(changes|edit)\?\s*\(y\)es\/\(n\)o|allow\s+\[y\/n\]|do\s+you\s+want\s+to\s+run/i.test(line);

      const isResolution =
        /applied\s+(changes|edit)|command\s+(completed|exited|executed)|user\s+(accepted|declined)/i.test(line);

      if (isApprovalRequest && !isResolution) {
        let summary = 'Aider confirmation requested';
        const cmdMatch = line.match(/(?:command|run)\s*[:=]?\s*[`"']?([^`"'\n\r]+)[`"']?/i);
        if (cmdMatch && cmdMatch[1]) {
          summary = `Aider command approval: ${cmdMatch[1].trim()}`;
        }

        this.eventSequence++;
        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}:${this.eventSequence}`).digest('hex').slice(0, 12);
        const eventId = `aider-${idHash}`;
        this.activePendingIds.add(eventId);

        const event: PermissionEvent = {
          id: eventId,
          agent: 'aider',
          type: line.toLowerCase().includes('command') || line.toLowerCase().includes('shell') ? 'terminal_command' : 'tool_execution',
          state: 'pending',
          summary,
          details: line,
          timestamp: Date.now(),
          metadata: { sourcePath }
        };

        this.permissionDetectedEmitter.fire(event);
      } else if (isResolution) {
        this.resolveAllPending();
        if (/applied\s+(changes|edit)/i.test(line)) {
          this.eventSequence++;
          const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}:${this.eventSequence}`).digest('hex').slice(0, 12);
          const finishEvent: PermissionEvent = {
            id: `aider-finish-${idHash}`,
            agent: 'aider',
            type: 'code_finish',
            state: 'pending',
            summary: 'Aider applied code changes',
            details: line,
            timestamp: Date.now(),
            metadata: { sourcePath }
          };
          this.permissionDetectedEmitter.fire(finishEvent);
        }
      }
    }
  }

  private resolveAllPending(): void {
    if (this.activePendingIds.size === 0) {
      this.permissionResolvedEmitter.fire({
        id: 'aider-all',
        agent: 'aider'
      });
      return;
    }
    for (const pendingId of this.activePendingIds) {
      this.permissionResolvedEmitter.fire({
        id: pendingId,
        agent: 'aider'
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
