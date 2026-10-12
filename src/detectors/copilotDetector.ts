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

    // Check if GitHub Copilot is installed
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

    // Periodic discovery for new session logs / transcripts (every 4 seconds)
    this.pollTimer = setInterval(() => {
      if (this.isRunning) {
        this.scanAndWatchTargets();
      }
    }, 4000);
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

  /**
   * Discovers and attaches file watchers to Copilot logs and transcripts.
   */
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
      } catch (err) {
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

    // 1. Custom user path if set
    const custom = this.settings.getCopilotCustomLogPath();
    if (custom) {
      paths.push(custom);
    }

    // 2. ~/.copilot/logs
    const homeCopilotLogs = path.join(os.homedir(), '.copilot', 'logs');
    paths.push(homeCopilotLogs);

    // 3. Workspace storage folder if available
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

    // 4. Standard OS VS Code workspaceStorage location
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
      // Start reading from current end to avoid retroactively alerting past requests
      this.fileOffsets.set(filePath, stats.size);
      this.watchedFiles.add(filePath);

      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.readNewContent(filePath);
        }
      });

      watcher.on('error', () => {
        this.watchedFiles.delete(filePath);
      });

      this.fileWatchers.push(watcher);
    } catch {
      // File could be locked or transient
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
        // File truncated/restarted
        this.fileOffsets.set(filePath, stats.size);
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

  /**
   * Inspects new text lines for permission / confirmation signatures.
   */
  public analyzeLogChunk(chunk: string, sourcePath: string): void {
    const lines = chunk.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      // Check for approval / confirmation requests
      const isApprovalRequest =
        /confirmation\s*(required|requested)|waiting\s+for\s+(user\s+)?confirmation|permission\s*(required|prompt)|prompt.*approval|approval.*pending|needs\s+permission|prepareInvocation.*confirm/i.test(line);

      const isResolution =
        /confirmation\s*(approved|granted|denied|rejected|canceled|cancelled)|user\s+(approved|rejected|allowed|denied)/i.test(line);

      if (isApprovalRequest && !isResolution) {
        // Extract command or tool details if available
        let summary = 'Command or tool execution requires confirmation';
        const cmdMatch = line.match(/(?:command|tool|action|execute)\s*[:=]\s*["']?([^"'\n\r]+)["']?/i);
        if (cmdMatch && cmdMatch[1]) {
          summary = `Approve action: ${cmdMatch[1].trim()}`;
        }

        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}`).digest('hex').slice(0, 16);
        const event: PermissionEvent = {
          id: `copilot-${idHash}`,
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
        const idHash = crypto.createHash('sha256').update(`${sourcePath}:${line}`).digest('hex').slice(0, 16);
        this.permissionResolvedEmitter.fire({
          id: `copilot-${idHash}`,
          agent: 'copilot'
        });
      }
    }
  }

  public dispose(): void {
    this.stop();
    this.permissionDetectedEmitter.dispose();
    this.permissionResolvedEmitter.dispose();
  }
}
