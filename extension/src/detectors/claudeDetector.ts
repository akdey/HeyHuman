import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentType, PermissionEvent } from '../events/permissionEvent';
import { DetectorStatusInfo, IAgentDetector } from './detectorTypes';
import { SettingsManager } from '../config/settings';

export class ClaudeDetector implements IAgentDetector {
  public readonly id: AgentType = 'claude';
  public readonly name = 'Claude Code';

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
            if (this.isClaudeSessionFile(fullFilePath)) {
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
        message: `Actively monitoring ${this.watchedFiles.size} Claude Code session log(s)`
      };
    } else {
      const homeClaude = path.join(os.homedir(), '.claude');
      const isInstalled = fs.existsSync(homeClaude);
      this.statusInfo = {
        status: isInstalled ? 'idle' : 'warning',
        message: isInstalled
          ? 'Claude Code detected (~/.claude); waiting for active terminal session'
          : 'Claude Code not found in ~/.claude. Specify custom path in settings if installed elsewhere.'
      };
    }
  }

  private isClaudeSessionFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    return ext === '.log' || ext === '.json' || ext === '.jsonl' || ext === '.txt' || base.includes('session') || base.includes('claude');
  }

  private getCandidatePaths(): string[] {
    const paths: string[] = [];

    // Custom path
    const custom = this.settings.getClaudeCustomLogPath();
    if (custom) {
      paths.push(custom);
    }

    // ~/.claude paths
    const homeClaude = path.join(os.homedir(), '.claude');
    paths.push(path.join(homeClaude, 'logs'));
    paths.push(path.join(homeClaude, 'sessions'));
    paths.push(path.join(homeClaude, 'projects'));

    // Current workspace folders
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
        paths.push(path.join(wf.uri.fsPath, '.claude'));
      }
    }

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
      console.warn(`[HeyHuman] Error reading Claude log update from ${filePath}:`, err);
    }
  }

  public analyzeLogChunk(chunk: string, sourcePath: string): void {
    const lines = chunk.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      // Check for permission prompt patterns in Claude Code
      const isApprovalRequest =
        /do\s+you\s+want\s+to\s+(run|execute|make)|allow\s+(this\s+)?(command|bash|tool|action)|\[y\/n\]|\(y\/n\)|permission\s+(required|needed)|wants\s+to\s+execute|approve\s+(command|changes)/i.test(line);

      const isResolution =
        /user\s+(approved|rejected|allowed|denied)|command\s+(completed|executed|exited|finished|cancelled)|\[y\/n\]:\s*[yn]/i.test(line);

      if (isApprovalRequest && !isResolution) {
        let summary = 'Claude Code action awaiting confirmation';
        const cmdMatch = line.match(/(?:command|bash|run|execute)\s*[:=]\s*["'`]?([^"'`\n\r]+)["'`]?/i);
        if (cmdMatch && cmdMatch[1]) {
          summary = `Approve command: ${cmdMatch[1].trim()}`;
        } else if (line.includes('[Y/n]') || line.includes('[y/n]')) {
          summary = `Approve action: ${line.slice(0, 70)}`;
        }

        this.eventSequence++;
        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}:${this.eventSequence}`).digest('hex').slice(0, 12);
        const eventId = `claude-${idHash}`;
        this.activePendingIds.add(eventId);

        const event: PermissionEvent = {
          id: eventId,
          agent: 'claude',
          type: line.toLowerCase().includes('bash') || line.toLowerCase().includes('command') ? 'terminal_command' : 'tool_execution',
          state: 'pending',
          summary,
          details: line,
          timestamp: Date.now(),
          metadata: { sourcePath }
        };

        this.permissionDetectedEmitter.fire(event);
      } else if (isResolution) {
        this.resolveAllPending();
      }
    }
  }

  private resolveAllPending(): void {
    if (this.activePendingIds.size === 0) {
      this.permissionResolvedEmitter.fire({
        id: 'claude-all',
        agent: 'claude'
      });
      return;
    }
    for (const pendingId of this.activePendingIds) {
      this.permissionResolvedEmitter.fire({
        id: pendingId,
        agent: 'claude'
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
