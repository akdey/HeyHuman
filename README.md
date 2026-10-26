# HeyHuman 🚨🤖

<p align="center">
  <img src="web/public/logo.svg" alt="HeyHuman Logo" width="120" height="120" />
</p>

<p align="center">
  <strong>"Hey human, wake up! Your AI agent is waiting for your permission."</strong><br>
  Audible sirens, voice speech, and phone alerts when autonomous AI agents (Google Antigravity, GitHub Copilot, Claude Code, Cursor, Aider) need your approval.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=akdey.heyhuman"><img src="https://img.shields.io/badge/VS_Code_Marketplace-akdey.heyhuman-blue?logo=visualstudiocode" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/akdey/heyhuman"><img src="https://img.shields.io/badge/Open_VSX-akdey.heyhuman-purple?logo=eclipse" alt="Open VSX"></a>
  <a href="https://github.com/akdey/HeyHuman/releases/tag/v1.2.1"><img src="https://img.shields.io/badge/Release-v1.2.1-green" alt="Release"></a>
  <img src="https://img.shields.io/badge/PWA-Ready-orange" alt="PWA Ready">
</p>

---

## 🤔 Why Does This Exist?

When you work with autonomous coding agents (**Google Antigravity**, **GitHub Copilot**, **Claude Code**, **Cursor**, or **Aider**), they periodically pause to ask:
- *"Can I run this terminal command?"*
- *"Can I edit this file outside the sandbox?"*
- *"I have a question about your project requirements..."*

If you switch to another monitor, open a browser tab, or step away to grab a coffee, **your AI stops completely and waits idle** — wasting precious coding time.

**HeyHuman** solves this:
1. **Loud Audio Sirens**: Plays unmistakable native sirens (`afplay` / PowerShell / `aplay`) that you can hear from another room, even when your editor is minimized.
2. **Instant Phone Relay**: Rings and vibrates your smartphone with the exact command or question waiting for you.
3. **One-Tap Bring to Front**: Pop your IDE back to the foreground on your desktop right from your phone.

---

## 📱 30-Second Setup Guide

You can connect your phone to your desktop in less than a minute — **zero mobile app downloads required**.

### Step 1: Open on Your Phone (Install as PWA)

1. Open **[hey-human-akdey.vercel.app](https://hey-human-akdey.vercel.app)** on your mobile browser (or scan the QR code from your desktop web app).
2. **Install to Home Screen** (optional, recommended):
   - **iPhone (Safari)**: Tap the **Share** button (square with arrow) &rarr; scroll down &rarr; tap **"Add to Home Screen"**.
   - **Android (Chrome)**: Tap the **Three Dots (⋮)** &rarr; tap **"Install App"** (or "Add to Home screen").
3. **Enable Audio & Lock Screen Alerts**:
   - Tap **"Tap for Sound"** once so your phone allows emergency sirens.
   - Tap **"Lock Alert"** (or approve the notification prompt) so HeyHuman registers cryptographic **Web Push** — this delivers native banners and vibration even when your phone is **locked and asleep in your pocket, with virtually zero battery drain**!

---

### Step 2: Connect to Your Desktop Editor

1. On your phone screen, copy your **Room ID** (e.g., `orbit-swift-551`), or tap **🔄** to generate a fresh one.
2. In **VS Code** or **Google Antigravity**:
   - Press **`Cmd+Shift+P`** (or `Ctrl+Shift+P` on Windows/Linux).
   - Type and choose: **`HeyHuman: Set Web Room ID`**.
   - Paste your Room ID and hit **Enter**.
   - *(Alternative)*: Click the **HeyHuman** item in your status bar (bottom right) &rarr; choose **`📡 Pair Web Alert Room...`**.
3. **You're Done!** Walk away from your desk. The moment your AI agent hits a permission checkpoint, your phone will alert you immediately.

---

## ⚡ Daily Workflow & Controls

When an agent needs your permission:
- **Desktop**: Sounds a loud emergency siren, presents a desktop notification, and speaks the prompt aloud.
- **Lock Screen**: Receive a native Web Push notification with instant action buttons:
  - **`✅ Approve (y)`**: Approve directly from your phone lock screen without opening the browser!
  - **`❌ Reject (n)`**: Reject directly from your lock screen.
- **Mobile Screen**: Vibrates and displays the exact command or question in a terminal inspection card, with 4 instant actions:
  - **`Approve (y)`**: Approves and auto-executes the command.
  - **`Reject (n)`**: Rejects and cancels execution.
  - **`🪟 Bring IDE to Front`**: Automatically raises your editor window over all other apps on your Mac/PC so you can view it immediately.
  - **`Silence Only`**: Mutes the alarm sound without altering agent state.

---

## 🤖 Remote Approvals & Antigravity Hook

### 1. Terminal Agents (Claude Code, Aider, CLI)
Tapping **`Approve (y)`** or **`Reject (n)`** injects `'y'` or `'n'` directly into the active terminal session.

### 2. Google Antigravity (Zero-Touch Mobile Approvals)
To allow Antigravity to auto-execute when approved from your phone:
1. In your project, run **`Cmd+Shift+P`** &rarr; **`HeyHuman: Enable Antigravity Mobile Approvals`**.
2. This creates `.agents/hooks.json` in your project root using Antigravity's native `PreToolUse` lifecycle hook.
3. When Antigravity needs permission (e.g. `BypassSandbox: true`), the hook alerts your phone.
4. When you tap **`Approve (y)`** on your phone, the hook outputs `{"decision": "allow"}` and Antigravity **executes the command immediately without prompting on your desktop**!

---

## ⚙️ Configuration Reference

Customize your experience in VS Code Settings (`Cmd+,` / `Ctrl+,`) or in `settings.json`:

```jsonc
{
  // Master toggle for all HeyHuman alerts
  "heyhuman.enabled": true,

  // Notification Triggers (When to notify - Checkboxes in Settings UI)
  "heyhuman.notifyOn.permissionNeeded": true,     // When agent pauses for human permission/approval
  "heyhuman.notifyOn.codeFinish": true,           // When agent finishes writing code / completes task
  "heyhuman.notifyOn.questionInput": true,        // When agent asks questions / questionnaires
  "heyhuman.notifyOn.taskError": true,            // When agent encounters command/tool execution errors
  "heyhuman.notifyOn.subagentMilestone": false,   // When background subagents finish delegated work
  "heyhuman.notifyOn.contextLimitWarning": false, // When agent nears token context or rate limits

  // Web Relay & Remote Room
  "heyhuman.webEndpoint": "https://hey-human-akdey.vercel.app",
  "heyhuman.webRoom": "your-room-id",
  "heyhuman.phoneAlerts.enabled": false,

  // Agent-specific controls
  "heyhuman.agents.antigravity.enabled": true,
  "heyhuman.agents.copilot.enabled": true,
  "heyhuman.agents.claude.enabled": true,
  "heyhuman.agents.cursor.enabled": true,
  "heyhuman.agents.aider.enabled": true,

  // Audio settings
  "heyhuman.sound.enabled": true,
  "heyhuman.sound.type": "siren", // "siren" | "alarm" | "chime" | "beep"
  "heyhuman.sound.volume": 80,    // 0 to 100
  "heyhuman.sound.customSoundPath": "",

  // Desktop notifications & Window Focus
  "heyhuman.notifications.enabled": true,
  "heyhuman.notifications.focusWindowOnClick": true,

  // Alert rate limiting & mute
  "heyhuman.alerts.cooldownSeconds": 5,
  "heyhuman.alerts.temporaryMuteDurationMinutes": 15
}
```

> **Tip:** You can toggle these triggers anytime via checkboxes in VS Code Settings (`heyhuman.notifyOn`), from the Command Palette (`HeyHuman: Configure Notification Triggers...`), or by clicking the HeyHuman status bar icon!

---

## 🤖 Supported Agents

HeyHuman actively monitors:

| Agent | Surface | Detection Strategy | Detected Permission Types |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | Antigravity IDE & 2.0 Desktop | Real-time JSONL Transcript Monitor (`~/.gemini/antigravity/brain/.../transcript.jsonl`) + Companion Port (`47291`) | • Sandbox bypass prompts (`BypassSandbox: true`)<br>• Interactive questions (`ask_question`)<br>• Steps blocked on user input (`WAITING_FOR_INPUT`) |
| **GitHub Copilot** | VS Code / Copilot Agent Mode | Log & Workspace Storage Observation (`workspaceStorage/<id>/GitHub.copilot-chat/`, `~/.copilot/logs`) | • Terminal execution approval prompts<br>• Tool confirmations (`prepareInvocation`)<br>• Script sandbox approval dialogs |
| **Claude Code** | Terminal CLI (`claude`) | Terminal output regex & ANSI stream watcher | • Bash command confirmation prompts (`[y/n]`)<br>• File modification authorizations |
| **Cursor Agent** | Cursor IDE | Composer log & terminal state watcher | • Shell execution approvals<br>• Workspace edits requiring confirmation |
| **Aider** | Terminal CLI (`aider`) | Terminal stream & git lock watcher | • Shell command execution prompts<br>• Auto-commit confirmations |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Agents ["Monitored Coding Agents"]
        Copilot["GitHub Copilot<br/>(Agent & Chat Mode)"]
        Antigravity["Google Antigravity<br/>(IDE / 2.0 Desktop)"]
        Claude["Claude Code & Aider<br/>(Terminal Sessions)"]
        Cursor["Cursor Agent<br/>(Permission Modals)"]
    end

    subgraph Detectors ["HeyHuman Detection Adapters"]
        CD["CopilotDetector<br/>(Storage & Log Watcher)"]
        AGD["AntigravityDetector<br/>(JSONL Transcript + Companion Port)"]
        CLD["ClaudeDetector & AiderDetector<br/>(Terminal Prompt Monitors)"]
    end

    subgraph Core ["Core Engine (Desktop Extension)"]
        PT["PermissionTracker<br/>(Deduplication & Lifecycle State)"]
        AM["AlertManager<br/>(Cooldown, Mute, Agent Toggles)"]
    end

    subgraph Dispatchers ["Alert & Relay Dispatchers"]
        AP["AudioPlayer<br/>(afplay / PowerShell / aplay)"]
        NM["NotificationManager<br/>(Desktop Toast & OS Window Focus)"]
        WR["Web Relay Dispatcher<br/>(HTTP POST to Webhook)"]
    end

    subgraph Mobile ["Mobile PWA (Vercel)"]
        PWA["HeyHuman Mobile PWA<br/>(Web Siren, Vibration, Command Inspection)"]
    end

    Copilot --> CD
    Antigravity --> AGD
    Claude --> CLD
    Cursor --> CD
    CD --> PT
    AGD --> PT
    CLD --> PT
    PT -->|New Pending Prompt| AM
    AM --> AP
    AM --> NM
    AM --> WR
    WR -.->|Stream Alert| PWA
```

---

## 🚀 Future Roadmap

### 1. Intelligent Notification Triggers & Sound Profiles
- [ ] **Distinct Sound Themes per Trigger Event**: Assign custom sounds per event (gentle harmonic chimes for code completion, urgent emergency sirens for permission blocks, subtle pings on subagent handoffs, alert buzzers for command/test failures).
- [ ] **Automated Test & Build Failure Detection**: Proactively parse terminal outputs and exit codes (`npm test`, `pytest`, `cargo test`) to alert when an agent's code change causes test suite or build regressions.
- [ ] **Long-Running Task Milestones & Inactivity Ping**: Audio reminder if an autonomous agent task runs uninterrupted for > 5 minutes or becomes stalled.
- [ ] **Context Window & Rate Limit Threshold Warnings**: Audio alert when conversation context reaches 85%+ or model rate limits approach before execution halts.
- [ ] **Focus Suppression ("Suppress If Focused")**: Automatically skip alarms if the editor window is already actively focused and the user is typing, only sounding alerts when the window is in the background.
- [ ] **Quiet Hours & Scheduled Do Not Disturb**: Schedule daily quiet periods (e.g. 10 PM - 8 AM) with automatic volume reduction or haptics-only mobile alerts.
- [ ] **Granular Agent Triggers**: Fine-tune triggers per agent (e.g. notify on both permissions and code finish for Antigravity, but only permissions for Copilot).

### 2. Interactive Remote Question Answering & Mobile Controls
- [ ] **Mobile Questionnaire Bridge**: Render Antigravity `ask_question` option choices directly on mobile, allowing you to select options (A, B, C) or type clarification replies from your phone.
- [ ] **Mobile Git Diff & File Inspection**: Review changed files, syntax diffs, and command blast radius on your smartphone before tapping Approve.
- [ ] **Voice-to-Text Dictation**: Dictate question responses and custom prompts into your phone microphone and stream them straight to the agent prompt.
- [ ] **Companion Daemon Injection**: Deep OS/IPC hook to auto-dismiss native sandbox bypass confirmations on verified mobile approval.

### 3. Multi-Device & Native Push Notifications
- [ ] **Web Push API (Apple APNs & FCM)**: Receive persistent lock-screen push notifications even when the browser tab is closed.
- [ ] **Apple Watch & Wear OS Complications**: Haptic pulse and prompt inspection directly on smartwatches.
- [ ] **Discord & Slack Webhooks**: Relay alerts to private developer team channels when long-running agent workflows hit gates or finish jobs.
- [ ] **Critical Alert Bypass for iOS**: High-priority push notifications that can break through iOS Focus / Do Not Disturb modes for urgent blocking permissions.

### 4. Voice & Speech Synthesis Intelligence
- [ ] **Spoken Action Prompts**: Custom spoken descriptions: *"Hey human! Antigravity needs permission to run git push"*.
- [ ] **Custom Voice Packs**: Choose between different voices (Jarvis, Retro Sci-Fi, Minimalist).

### 5. Multi-Agent Team Orchestration & Standalone Companion
- [ ] **Subagent Dependency Graph**: Live visualization and notifications for subagent handoffs (`invoke_subagent`), showing active subagent states and progress.
- [ ] **Menu Bar / System Tray App**: Lightweight background tray app for macOS, Windows, and Linux that monitors agents across all workspaces without requiring VS Code to remain open.

---

## 🛠️ Development & Testing

```bash
# Clone the repository
git clone https://github.com/akdey/HeyHuman.git
cd HeyHuman

# Extension unit tests (30 passing tests)
cd extension
npm install
npm test

# Build mobile PWA
cd ../web
npm install
npm run build
```

---

## 👨‍💻 Author & Engineering

Designed & Engineered by **[AMIT KUMAR DEY](https://portfolio.akdey.vercel.app/)**

License: MIT
