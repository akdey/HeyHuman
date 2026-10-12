import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { SoundType } from '../config/settings';

export interface AudioPlayerOptions {
  extensionPath: string;
}

export class AudioPlayer {
  private extensionPath: string;
  private currentProcess: ChildProcess | null = null;

  constructor(options: AudioPlayerOptions) {
    this.extensionPath = options.extensionPath;
  }

  /**
   * Resolves the full path to the requested sound file.
   */
  public resolveSoundPath(soundType: SoundType, customPath?: string): string | null {
    if (customPath && customPath.trim().length > 0) {
      const trimmed = customPath.trim();
      if (fs.existsSync(trimmed)) {
        return trimmed;
      }
    }

    const soundFileName = `${soundType}.wav`;
    const defaultSound = path.join(this.extensionPath, 'media', 'sounds', soundFileName);

    if (fs.existsSync(defaultSound)) {
      return defaultSound;
    }

    // Fallback to siren.wav if requested sound doesn't exist
    const fallback = path.join(this.extensionPath, 'media', 'sounds', 'siren.wav');
    if (fs.existsSync(fallback)) {
      return fallback;
    }

    return null;
  }

  /**
   * Plays the specified sound with the given volume (0 - 100).
   * Safe execution that never throws or crashes the host.
   */
  public async playSound(soundType: SoundType, volume = 80, customPath?: string): Promise<boolean> {
    const soundPath = this.resolveSoundPath(soundType, customPath);
    if (!soundPath) {
      console.warn(`[HeyHuman] Audio file not found for type: ${soundType}`);
      return false;
    }

    // Stop currently running playback if any
    this.stopCurrentPlayback();

    const normalizedVol = Math.max(0, Math.min(100, volume));
    if (normalizedVol === 0) {
      return true; // Muted volume
    }

    return new Promise<boolean>((resolve) => {
      try {
        const platform = process.platform;
        let proc: ChildProcess;

        if (platform === 'darwin') {
          // macOS: afplay with -v (0.0 to 1.0 or higher)
          const afplayVol = (normalizedVol / 100).toFixed(2);
          proc = spawn('/usr/bin/afplay', ['-v', afplayVol, '-t', '4', soundPath], {
            stdio: 'ignore'
          });
        } else if (platform === 'win32') {
          // Windows: use PowerShell SoundPlayer
          const escapedPath = soundPath.replace(/'/g, "''");
          const psCommand = `(New-Object System.Media.SoundPlayer '${escapedPath}').PlaySync()`;
          proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
            stdio: 'ignore'
          });
        } else {
          // Linux: check for paplay then aplay
          if (fs.existsSync('/usr/bin/paplay')) {
            proc = spawn('/usr/bin/paplay', [soundPath], { stdio: 'ignore' });
          } else {
            proc = spawn('aplay', ['-q', soundPath], { stdio: 'ignore' });
          }
        }

        this.currentProcess = proc;

        proc.on('error', (err) => {
          console.warn('[HeyHuman] Failed to play audio via system player:', err);
          this.currentProcess = null;
          resolve(false);
        });

        proc.on('close', (code) => {
          this.currentProcess = null;
          resolve(code === 0);
        });
      } catch (err) {
        console.warn('[HeyHuman] Unexpected audio player error:', err);
        resolve(false);
      }
    });
  }

  public stopCurrentPlayback(): void {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
      } catch {
        // Ignore kill errors
      }
      this.currentProcess = null;
    }
  }

  public dispose(): void {
    this.stopCurrentPlayback();
  }
}
