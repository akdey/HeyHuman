# Change Log

All notable changes to the "heyhuman" extension will be documented in this file.

## [1.3.0] - 2026-10-26

### Added
- **Notification Trigger Checkboxes (`heyhuman.notifyOn.*`)**: Added granular toggle checkboxes in VS Code Settings (`Cmd+,`) allowing developers to select exactly which events trigger alerts:
  - `heyhuman.notifyOn.permissionNeeded` (default `true`): Trigger alert when an AI agent pauses and requires human approval/permission (terminal command, sandbox bypass, file edit).
  - `heyhuman.notifyOn.codeFinish` (default `true`): Trigger alert when an AI agent finishes generating code or completes its task.
  - `heyhuman.notifyOn.questionInput` (default `true`): Trigger alert when an agent asks a question or questionnaire (`ask_question`).
  - `heyhuman.notifyOn.taskError` (default `true`): Trigger alert when an agent encounters an execution failure or command error.
  - `heyhuman.notifyOn.subagentMilestone` (default `false`): Trigger alert when a background subagent finishes execution.
  - `heyhuman.notifyOn.contextLimitWarning` (default `false`): Trigger alert when an agent nears context length or quota limits.
- **Interactive Checkbox QuickPick Dialog**: Added `HeyHuman: Configure Notification Triggers...` (`heyhuman.configureNotificationTriggers`) command in the Command Palette and Status Bar Quick Menu (`$(checklist) Notification Triggers...`) with multi-select checkboxes.
- **Intelligent Audio Adaptability**: Automatically plays a harmonic chime on code completion instead of a harsh emergency siren.
- **Agent Code Finish Detection**: Emits `code_finish` lifecycle events across Google Antigravity, Claude Code, and Aider.

## [1.2.7] - 2026-10-13

### Added
- **Opt-in Phone Notifications Setting**: Added `heyhuman.phoneAlerts.enabled` (default `false`). When disabled, the extension enforces zero network calls—no web alert dispatching (`POST`) and no remote action polling (`GET`).
- **Quick Toggle Command**: Added `HeyHuman: Toggle Phone Notifications` command (`heyhuman.togglePhoneAlerts`) and quick-pick entry in the status bar menu.
- **Hook & Companion Awareness**: Local companion server and workspace hooks now respect the phone notifications flag, ensuring alerts remain strictly local unless the developer opts in.

## [1.2.6] - 2026-10-13

### Fixed
- **Antigravity IDE Environment Detection**: Added deep runtime detection via `vscode.env.appName`, `process.execPath`, and `vscode.env.appRoot` so Antigravity IDE is instantly recognized as active without relying solely on static filesystem paths.
- **Multi-Path Brain & Transcript Discovery**: Expanded brain transcript directory scanning across `~/.gemini/antigravity`, `~/.antigravity`, `Library/Application Support/Antigravity`, and workspace `.agents` / `.gemini` paths.

## [1.2.5] - 2026-10-13

### Added
- **Faithful Antigravity Permission Card Interface**: Complete pixel-faithful mobile recreation of the native Google Antigravity desktop modal prompt. Displays the terminal header, monospace command inset, numbered options (`1`, `2`, `3`, `4`), selected state highlight, expandable custom instruction field on Option 4, `Skip`, and vivid blue `Submit ↵` button.
- **Agent-Specific Modal Customization**: Tailored UI cards for each AI agent without over-generalization — dedicated interfaces for Google Antigravity, GitHub Copilot, Claude Code, and Cursor.
- **Direct Application Key Input Simulation**: When an option is submitted from mobile, native automation activates the editor host process (`Antigravity IDE` / `Code` / `Cursor`), enters the option number, inserts any custom response text, and presses Return/Enter (`Submit ↵`) to confirm automatically on the desktop.
- **Physical Keyboard Navigation**: Full keyboard parity (`1`, `2`, `3`, `4`, and `Enter`) on the mobile web app for instant option switching and submission.

## [1.2.4] - 2026-10-13

### Added
- **Multi-Choice Interactive Questionnaire UI**: Full mobile support for Google Antigravity's interactive questions (`ask_question`). Instead of generic "y/n" buttons, options 1, 2, 3, 4... are displayed as individual interactive buttons on the phone.
- **Custom Write-In Response Input**: Developers can now type custom answers or notes directly from their phone and submit them to their desktop AI agent.
- **Rich Web Push Option Banners**: Lock screen notification previews now list the available multiple-choice options (`[1] ... [2] ... [3] ...`).
- **Clipboard Sync & Desktop Input Delivery**: Submitting an answer from the phone copies the response to the desktop clipboard, brings the IDE to focus, and dispatches the input to the agent.

## [1.2.3] - 2026-10-13

### Added
- **Antigravity Mobile Approvals Hook**: Automated lifecycle hook (`.agents/hooks.json` & `.agents/scripts/heyhuman-hook.js`) enabling one-tap approvals from mobile without touching desktop. When approved on phone, Antigravity executes immediately.
- **Companion IPC Action Bridge**: Added `GET /action` and `POST /action` endpoints on `http://127.0.0.1:47291` to bridge remote phone decisions into Antigravity in < 1ms.
- **Lock Screen Notification Actions**: Interactive Web Push notification buttons (`✅ Approve (y)` and `❌ Reject (n)`) in service worker, allowing developers to approve or reject actions directly on their phone lock screen without opening the browser.
- **`HeyHuman: Enable Antigravity Mobile Approvals` Command**: One-click command to install and configure Antigravity lifecycle hooks in any workspace.

## [1.2.2] - 2026-10-13

### Changed
- **Synchronized Documentation**: Synced extension README and CHANGELOG to Marketplace and Open VSX with complete 30-second phone setup guides, Apple-grade alert modal inspection, and lock-screen Web Push notification instructions.

## [1.2.1] - 2026-10-13

### Added
- **Remote Actions Queue**: Dispatches mobile actions (`Approve (y)`, `Reject (n)`, `Bring IDE to Front`) straight to active terminal agent sessions.
- **Enhanced OS Window Focus**: Multi-target OS-level window activation targeting `Antigravity IDE`, `Antigravity`, `Visual Studio Code`, `Cursor`, and `Code` via AppleScript, PowerShell, and `wmctrl`.
- **Default Production Relay**: Configured `heyhuman.webEndpoint` default to `https://hey-human-akdey.vercel.app`.
- **Web Push Notifications**: Cryptographic VAPID Web Push notifications waking phones even when locked in pocket.
- **Apple-Grade Dialog Redesign**: Polished modal alert UI on mobile with monospace terminal command inspection.

## [1.2.0] - 2026-10-13

### Added
- **Mobile Web App & PWA Relay**: Full mobile siren support via Vercel serverless relay. Allows developers to step away from their desk and receive sirens, voice announcements, vibration, and push notifications on mobile phones.
- **Interactive Room Pairing Command**: Added `HeyHuman: Set Web Room ID` (`heyhuman.setWebRoom`) interactive input box in the Command Palette and Status Bar quick menu.
- **Web Alert Dispatcher**: Integrated automatic non-blocking alert streaming to configured Web Rooms from `AlertManager` across all 5 supported AI agents (Antigravity, Copilot, Claude Code, Cursor, Aider).

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
