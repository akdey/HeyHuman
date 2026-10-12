# HeyHuman 🚨🤖

<p align="center">
  <img src="web/public/logo.svg" alt="HeyHuman Logo" width="120" height="120" />
</p>

<p align="center">
  <strong>"Hey human, wake up! Your AI agent is waiting for your permission."</strong><br>
  Audible siren, voice speech, and phone alerts when autonomous AI agents (Google Antigravity, GitHub Copilot, Claude Code, Cursor, Aider) need your permission.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=akdey.heyhuman"><img src="https://img.shields.io/badge/VS_Code_Marketplace-akdey.heyhuman-blue?logo=visualstudiocode" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org/extension/akdey/heyhuman"><img src="https://img.shields.io/badge/Open_VSX-akdey.heyhuman-purple?logo=eclipse" alt="Open VSX"></a>
  <a href="https://github.com/akdey/HeyHuman/releases/tag/v1.2.0"><img src="https://img.shields.io/badge/Release-v1.2.0-green" alt="Release"></a>
  <img src="https://img.shields.io/badge/PWA-Ready-orange" alt="PWA Ready">
</p>

---

## ⚡ Features Matrix

| Feature | Description | Status |
| :--- | :--- | :---: |
| 🚨 **Loud Audio Sirens** | Emergency police siren, alarm, chime, and beep audio profiles | ✅ Done |
| 🤖 **Multi-Agent Watchers** | Supports Google Antigravity, GitHub Copilot, Claude Code, Cursor, and Aider | ✅ Done |
| 🪟 **Contextual Window Focus** | Automatically focuses editor, terminal panel, or chat on approval prompts | ✅ Done |
| 🌐 **PWA & Mobile Relay App** | Web app for phones/tablets away from desk; zero local installation needed | ✅ Done |
| 📱 **QR Code Mobile Pairing** | Instant phone camera scan to tune phone to your desktop's alert room | ✅ Done |
| 🔄 **Rotate Key & Auto-Tune** | Instantly generate/cycle secure room keys with automatic persistent tuning | ✅ Done |
| 🗣️ **Voice Speech Alerts** | Text-to-speech announcement: *"Hey human! AI needs your permission!"* | ✅ Done |
| 🔒 **Multi-User Room Isolation** | Unique isolated rooms (`?room=akdey`) so alerts never leak to others | ✅ Done |
| 🪝 **Direct Webhook API** | Simple HTTP POST integration for custom CLI tools and pipelines | ✅ Done |

---

## 📁 Repository Structure

```
HeyHuman/
├── extension/          # VS Code & Antigravity IDE Extension
│   ├── src/            # Multi-agent watchers, notification & sound engine
│   ├── media/          # Audio sirens, vector logos, and visual assets
│   ├── test/           # Test suite (30 passing unit tests)
│   └── package.json    # Published to VS Code Marketplace & Open VSX
│
└── web/                # Mobile-Responsive PWA & Web Siren (Vercel)
    ├── src/            # React + Vite + Web Audio & Speech Synthesis
    ├── api/            # Serverless Webhook & Polling Endpoint (/api/alert)
    ├── public/         # PWA Manifest, Service Worker assets, sound fallbacks
    └── vercel.json     # 1-Click Vercel deployment configuration
```

---

## 🌐 HeyHuman Web App (Deploy on Vercel)

For developers away from their desk, cooking, or on their phone where desktop sirens can't be heard:

<p align="center">
  <img src="web/public/logo.svg" width="60" alt="Relay">
</p>

### Key Highlights
- **PWA Installable**: Add to Home Screen on iOS Safari and Android Chrome.
- **QR Code Pairing**: Instant scan with your phone camera, with robot logo centered in the QR code.
- **Rotate Key Support**: 1-click button to cycle new secure room IDs (`hyper-orbit-318`).
- **Acoustic Fallback**: Synthesized Web Audio oscillator engine that works offline and across mobile browsers.
- **Haptic Feedback**: Mobile vibration sequence on incoming alerts.

### 1-Click Deployment to Vercel
1. Fork or import this repository on [vercel.com](https://vercel.com).
2. Set the **Root Directory** to `web`.
3. Click **Deploy**.

### Connect Your Extension to Your Phone
In VS Code / Antigravity:
1. Press `Cmd+Shift+P` &rarr; choose **`HeyHuman: Set Web Room ID`**.
2. Type or paste your room code (e.g. `akdey`).
3. Done! All permission alerts from Antigravity, Copilot, Claude, Cursor, and Aider will stream directly to your phone.

---

## 🧩 Editor Extension (Antigravity, VS Code, Cursor)

Install directly from your editor's Extension marketplace:
- **VS Code**: Search `HeyHuman` or visit [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=akdey.heyhuman).
- **Antigravity / Cursor / VSCodium**: Search `HeyHuman` on [Open VSX](https://open-vsx.org/extension/akdey/heyhuman).

### Extension CLI commands
- `HeyHuman: Test Alert Sound`
- `HeyHuman: Temporarily Mute Alerts (15 mins)`
- `HeyHuman: Unmute Alerts`
- `HeyHuman: Toggle Enable/Disable`

---

## 👨‍💻 Author & Engineering

Designed & Engineered by **[AMIT KUMAR DEY](https://portfolio.akdey.vercel.app/)**

License: MIT
