# HeyHuman 🚨🤖

> **"Hey human, wake up! Your AI agent is waiting for your permission."**

Audible siren and visual alerts when autonomous AI agents (Google Antigravity, GitHub Copilot, Claude Code, Cursor, Aider) need your permission to run terminal commands or execute tools.

---

## 📁 Repository Structure

```
HeyHuman/
├── extension/          # VS Code & Antigravity IDE Extension
│   ├── src/            # Multi-agent watchers & sound/notification engine
│   ├── media/          # Sirens, alarms, and vector logos
│   └── package.json    # Published to VS Code Marketplace & Open VSX
│
└── web/                # Mobile-Responsive Web Siren & Alert App (Vercel)
    ├── src/            # React + Vite + Web Audio & Speech Synthesis
    ├── api/            # Serverless Webhook & Polling Endpoint (/api/alert)
    └── vercel.json     # Ready for 1-click Vercel deployment
```

---

## 🌐 HeyHuman Web App (Deploy to Vercel)

For developers away from their desk, on their phone, cooking, or using machines where they don't want desktop noise.

### Features
- 📱 **Mobile-First & PWA Ready**: Optimized for iOS Safari and Android Chrome with vibration and Web Push notifications.
- 🔊 **Audio Sirens & Voice Speech**: Real siren / alarm audio plus text-to-speech (*"Hey human, Antigravity requires your permission!"*).
- 🏷️ **Personal Alert Rooms**: Access via `https://heyhuman.vercel.app/?room=yourname`.
- 🔌 **Instant Webhook Integration**: Simple `curl` hook for Claude Code, Cursor, or Antigravity:
  ```bash
  curl -X POST "https://your-domain.vercel.app/api/alert?room=akdey" \
    -H "Content-Type: application/json" \
    -d '{"agent":"Claude Code","tool":"Terminal","description":"Permission needed"}'
  ```

### Run Locally
```bash
cd web
npm install
npm run dev
```

### Deploy to Vercel
1. Push this repository to GitHub.
2. In Vercel, import the repository and set the **Root Directory** to `web`.
3. Deploy!

---

## 🧩 HeyHuman Editor Extension

Available on:
- **VS Code Marketplace**: [akdey.heyhuman](https://marketplace.visualstudio.com/items?itemName=akdey.heyhuman)
- **Open VSX (Antigravity & Cursor)**: [open-vsx.org/extension/akdey/heyhuman](https://open-vsx.org/extension/akdey/heyhuman)

### Build & Test Extension
```bash
cd extension
npm install
npm test
npm run compile
```
