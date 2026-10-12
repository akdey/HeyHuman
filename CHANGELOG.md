# Change Log

All notable changes to the "heyhuman" extension will be documented in this file.

## [1.1.2] - 2026-10-12

### Added
- **Official Branding**: Added high-resolution sarcastic robot logo and icon assets to the extension manifest and documentation for Marketplace rendering.

## [1.1.1] - 2026-10-12

### Fixed
- **Notification Focus Action**: Resolved issue where clicking "Focus Editor" didn't activate the pending permission context. Implemented OS-level window activation (macOS `open -a` / `osascript` and Windows PowerShell) to bring the host window to the front, and automatically routes focus to the active Chat panel or Integrated Terminal where the AI permission prompt is waiting.

## [1.1.0] - 2026-10-12

### Added
- **Claude Code Support**: Added `ClaudeDetector` to monitor Anthropic's `claude` CLI terminal sessions and approval prompts (`[Y/n]`).
- **Cursor Agent Support**: Added `CursorDetector` observing Cursor's workspace storage and Composer confirmation dialogs.
- **Aider Support**: Added `AiderDetector` observing `.aider.chat.history.md` for shell execution and code change approvals.
- **Agent Toggles**: Added settings `heyhuman.agents.claude.enabled`, `heyhuman.agents.cursor.enabled`, and `heyhuman.agents.aider.enabled` with individual toggles.
- **30 Comprehensive Unit Tests**: Expanded test suite covering detection and resolution lifecycle across all 5 AI coding agents.

## [1.0.1] - 2026-10-12

### Fixed
- **Subsequent Alert Delivery**: Fixed lifecycle state machine in `PermissionTracker` that prevented subsequent alerts from firing after a request was marked resolved or approved.
- **Continuous File Polling**: Added 1000ms proactive polling across all active log and transcript targets to prevent missed events on macOS/Linux where native `fs.watch` event hooks drop on atomic writes.
- **Unified Resolution IDs**: Fixed ID mismatch between prompt detectors and resolution events so pending state reliably clears when the user acts.
- **Audio Process Timeout**: Added `-t 4` flag to macOS `afplay` invocation to prevent audio player locks.
- **Real-Time Output Channel**: Added dedicated `HeyHuman` output channel in VS Code for live event tracing.

## [1.0.0] - 2026-10-12

### Initial Release
- **Core Siren Alert Engine**: Real-time audible siren alerts whenever an AI coding agent requires user approval.
- **GitHub Copilot Detection**: Monitors workspace storage and transcripts for terminal approvals and tool confirmation requests.
- **Google Antigravity Detection**: Real-time monitoring of Antigravity transcripts (`transcript.jsonl`) for `ask_question`, `BypassSandbox`, and waiting input states, plus a built-in local companion IPC receiver.
- **Lifecycle & Deduplication Tracking**: Reliable state tracking that prevents repeated alarms while a request remains pending, re-arming upon resolution.
- **Sound Customization**: Bundled multi-frequency siren, alarm bursts, gentle chime, and alert beeps with volume control and custom sound path support.
- **Temporary Mute & Cooldown**: Configurable cooldown period (default 5s) and temporary mute durations (15m, 30m, 1h, 2h).
- **Status Bar Integration**: Visual status indicators (`$(bell) HeyHuman: On`, `$(bell-slash) HeyHuman: Muted`, `$(mute) HeyHuman: Off`) with one-click quick menu.
