import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AgentType, PermissionEvent } from '../events/permissionEvent';
import { DetectorStatusInfo, IAgentDetector } from './detectorTypes';
import { SettingsManager } from '../config/settings';

export class CopilotDetector implements IAgentDetector {
  public readonly id: AgentType = 'copilot';
  public readonly name = 'GitHub Copilot';

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

  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    const copilotInstalled = this.isCopilotInstalled();
    if (!copilotInstalled) {
      this.statusInfo = {
        status: 'warning',
        message: 'GitHub Copilot extension is not currently active or installed'
      };
    } else {
      this.statusInfo = {
        status: 'active',
        message: 'Active - Monitoring Copilot chat transcripts and logs'
      };
    }

    this.scanAndWatchTargets();

    // Periodic discovery + active polling (every 1000ms)
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

  private isCopilotInstalled(): boolean {
    return !!(
      vscode.extensions.getExtension('github.copilot-chat') ||
      vscode.extensions.getExtension('github.copilot') ||
      vscode.extensions.getExtension('GitHub.copilot-chat') ||
      vscode.extensions.getExtension('GitHub.copilot')
    );
  }

  private scanAndWatchTargets(): void {
    const candidates = this.getCandidateLogPaths();
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
            if (this.isLogOrTranscript(fullFilePath)) {
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

    if (anyActive) {
      this.statusInfo = {
        status: 'active',
        message: `Actively monitoring ${this.watchedFiles.size} Copilot transcript/log target(s)`
      };
    }
  }

  private isLogOrTranscript(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    return ext === '.log' || ext === '.jsonl' || ext === '.json' || base.includes('copilot') || base.includes('transcript');
  }

  private getCandidateLogPaths(): string[] {
    const paths: string[] = [];

    const custom = this.settings.getCopilotCustomLogPath();
    if (custom) {
      paths.push(custom);
    }

    const homeCopilotLogs = path.join(os.homedir(), '.copilot', 'logs');
    paths.push(homeCopilotLogs);

    try {
      if (this.context.storageUri?.fsPath) {
        const parentStorage = path.dirname(this.context.storageUri.fsPath);
        const copilotStorage = path.join(parentStorage, 'GitHub.copilot-chat');
        paths.push(copilotStorage);
        paths.push(path.join(copilotStorage, 'transcripts'));
      }
    } catch {
      // Ignore
    }

    const appData = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || '', 'Code', 'User', 'workspaceStorage')
        : path.join(os.homedir(), '.config', 'Code', 'User', 'workspaceStorage');

    if (fs.existsSync(appData)) {
      paths.push(appData);
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
      // File could be transient
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
      console.warn(`[HeyHuman] Error reading Copilot log update from ${filePath}:`, err);
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
        /confirmation\s*(required|requested)|waiting\s+for\s+(user\s+)?confirmation|permission\s*(required|prompt)|prompt.*approval|approval.*pending|needs\s+permission|prepareInvocation.*confirm/i.test(line);

      const isResolution =
        /confirmation\s*(approved|granted|denied|rejected|canceled|cancelled)|user\s+(approved|rejected|allowed|denied)/i.test(line);

      if (isApprovalRequest && !isResolution) {
        let summary = 'Command or tool execution requires confirmation';
        const cmdMatch = line.match(/(?:command|tool|action|execute)\s*[:=]\s*["']?([^"'\n\r]+)["']?/i);
        if (cmdMatch && cmdMatch[1]) {
          summary = `Approve action: ${cmdMatch[1].trim()}`;
        }

        this.eventSequence++;
        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}:${this.eventSequence}`).digest('hex').slice(0, 12);
        const eventId = `copilot-${idHash}`;
        this.activePendingIds.add(eventId);

        const event: PermissionEvent = {
          id: eventId,
          agent: 'copilot',
          type: line.toLowerCase().includes('terminal') ? 'terminal_command' : 'tool_execution',
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
        id: 'copilot-all',
        agent: 'copilot'
      });
      return;
    }
    for (const pendingId of this.activePendingIds) {
      this.permissionResolvedEmitter.fire({
        id: pendingId,
        agent: 'copilot'
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
