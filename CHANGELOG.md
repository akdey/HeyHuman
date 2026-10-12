# Change Log

All notable changes to the "heyhuman" extension will be documented in this file.

## [1.0.0] - 2026-10-12

### Initial Release
- **Core Siren Alert Engine**: Real-time audible siren alerts whenever an AI coding agent requires user approval.
- **GitHub Copilot Detection**: Monitors workspace storage and transcripts for terminal approvals and tool confirmation requests.
- **Google Antigravity Detection**: Real-time monitoring of Antigravity transcripts (`transcript.jsonl`) for `ask_question`, `BypassSandbox`, and waiting input states, plus a built-in local companion IPC receiver.
- **Lifecycle & Deduplication Tracking**: Reliable state tracking that prevents repeated alarms while a request remains pending, re-arming upon resolution.
- **Sound Customization**: Bundled multi-frequency siren, alarm bursts, gentle chime, and alert beeps with volume control and custom sound path support.
- **Temporary Mute & Cooldown**: Configurable cooldown period (default 5s) and temporary mute durations (15m, 30m, 1h, 2h).
- **Status Bar Integration**: Visual status indicators (`$(bell) HeyHuman: On`, `$(bell-slash) HeyHuman: Muted`, `$(mute) HeyHuman: Off`) with one-click quick menu.
