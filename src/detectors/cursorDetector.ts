import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentType, PermissionEvent } from '../events/permissionEvent';
import { DetectorStatusInfo, IAgentDetector } from './detectorTypes';
import { SettingsManager } from '../config/settings';

export class CursorDetector implements IAgentDetector {
  public readonly id: AgentType = 'cursor';
  public readonly name = 'Cursor Agent';

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
            if (this.isCursorFile(fullFilePath)) {
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
        message: `Actively monitoring ${this.watchedFiles.size} Cursor agent transcript/log target(s)`
      };
    } else {
      const isCursor =
        fs.existsSync('/Applications/Cursor.app') ||
        fs.existsSync(path.join(os.homedir(), '.cursor'));

      this.statusInfo = {
        status: isCursor ? 'idle' : 'warning',
        message: isCursor
          ? 'Cursor detected; waiting for active agent session'
          : 'Cursor storage not found in default paths. Configure custom path in settings if needed.'
      };
    }
  }

  private isCursorFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    return ext === '.log' || ext === '.json' || ext === '.jsonl' || base.includes('agent') || base.includes('cursor');
  }

  private getCandidatePaths(): string[] {
    const paths: string[] = [];

    // Custom path
    const custom = this.settings.getCursorCustomLogPath();
    if (custom) {
      paths.push(custom);
    }

    // Cursor workspaceStorage
    const appData = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || '', 'Cursor', 'User', 'workspaceStorage')
        : path.join(os.homedir(), '.config', 'Cursor', 'User', 'workspaceStorage');

    if (fs.existsSync(appData)) {
      paths.push(appData);
    }

    // ~/.cursor
    paths.push(path.join(os.homedir(), '.cursor', 'logs'));

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
      console.warn(`[HeyHuman] Error reading Cursor log update from ${filePath}:`, err);
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
        /cursor.*(requires|waiting\s+for)\s+(approval|confirmation)|allow\s+command|run\s+in\s+terminal.*confirm|permission\s+required\s+for\s+tool|agent\s+awaiting\s+user/i.test(line);

      const isResolution =
        /cursor.*(approved|rejected|allowed|denied)|command\s+executed|permission\s+granted/i.test(line);

      if (isApprovalRequest && !isResolution) {
        let summary = 'Cursor Agent requires confirmation';
        const cmdMatch = line.match(/(?:command|tool|action)\s*[:=]\s*["'`]?([^"'`\n\r]+)["'`]?/i);
        if (cmdMatch && cmdMatch[1]) {
          summary = `Approve action: ${cmdMatch[1].trim()}`;
        }

        this.eventSequence++;
        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}:${this.eventSequence}`).digest('hex').slice(0, 12);
        const eventId = `cursor-${idHash}`;
        this.activePendingIds.add(eventId);

        const event: PermissionEvent = {
          id: eventId,
          agent: 'cursor',
          type: line.toLowerCase().includes('terminal') || line.toLowerCase().includes('command') ? 'terminal_command' : 'tool_execution',
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
        id: 'cursor-all',
        agent: 'cursor'
      });
      return;
    }
    for (const pendingId of this.activePendingIds) {
      this.permissionResolvedEmitter.fire({
        id: pendingId,
        agent: 'cursor'
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
