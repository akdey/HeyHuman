#!/usr/bin/env node
/**
 * HeyHuman Antigravity Lifecycle Hook
 * Intercepts tool calls (e.g. run_command with BypassSandbox: true).
 * When approval is required:
 *   1. Emits alert to HeyHuman companion and mobile room.
 *   2. Waits up to 35s for mobile action (Approve / Reject).
 *   3. If approved via phone: outputs { "decision": "allow" } -> Antigravity runs immediately!
 *   4. If rejected via phone: outputs { "decision": "deny" } -> Antigravity cancels tool.
 *   5. If timeout reached: outputs { "decision": "ask" } -> Falls back to desktop prompt.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const COMPANION_PORT = 47291;
const DEFAULT_ENDPOINT = 'https://hey-human-akdey.vercel.app';
const TIMEOUT_SECONDS = 35;

async function main() {
  // 1. Read input JSON from stdin
  let inputRaw = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    inputRaw += chunk;
  }

  let payload = {};
  try {
    payload = JSON.parse(inputRaw || '{}');
  } catch {
    // If not valid JSON, default to asking
    outputDecision('ask', 'Could not parse hook input');
    return;
  }

  const toolCall = payload.toolCall || {};
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};
  const stepIdx = payload.stepIdx ?? 0;

  // 2. Determine if this tool requires explicit human approval
  const isBypass = args.BypassSandbox === true || args.BypassSandbox === 'true';
  const cmdStr = (args.CommandLine || '').toLowerCase();
  const isDestructive = cmdStr.includes('rm -rf') || cmdStr.includes('git reset --hard') || cmdStr.includes('npm publish') || cmdStr.includes('drop database');
  const isSensitive = isBypass || toolName === 'ask_question' || isDestructive;

  if (!isSensitive) {
    // Ordinary sandboxed command or safe tool: allow immediately without delay
    outputDecision('allow');
    return;
  }

  const commandStr = args.CommandLine || toolName;
  const alertId = `ag-step-${stepIdx}-hook-${Date.now()}`;

  // 3. Resolve active room ID
  let room = process.env.HEYHUMAN_ROOM || '';
  if (!room) {
    try {
      const companionStatus = await httpGetJson(`http://127.0.0.1:${COMPANION_PORT}/status`);
      if (companionStatus && companionStatus.room) {
        room = companionStatus.room;
      }
    } catch {
      // Companion server may not be up
    }
  }

  if (!room) {
    try {
      // Check VS Code global settings or workspace settings
      const settingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        room = s['heyhuman.webRoom'] || '';
      }
    } catch {}
  }

  if (!room) {
    room = 'orbit-swift-551'; // Fallback room for this project
  }

  // 4. Broadcast alert to Companion and Web Relay
  const alertPayload = {
    id: alertId,
    agent: 'ANTIGRAVITY',
    type: 'Permission Request',
    tool: toolName,
    command: String(commandStr).slice(0, 150),
    description: `Antigravity wants to run: ${String(commandStr).slice(0, 100)}`,
    timestamp: Date.now()
  };

  // Notify companion server (local desktop)
  httpPostJson(`http://127.0.0.1:${COMPANION_PORT}/alert`, alertPayload).catch(() => {});

  // Notify web relay (mobile phone & Web Push)
  const webUrl = `${DEFAULT_ENDPOINT}/api/alert?room=${encodeURIComponent(room)}`;
  await httpPostJson(webUrl, alertPayload).catch(() => {});

  // 5. Poll for remote approval or rejection from mobile phone
  const startTime = Date.now();
  const maxWaitMs = TIMEOUT_SECONDS * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(600);

    // Check local companion server first
    try {
      const compRes = await httpGetJson(`http://127.0.0.1:${COMPANION_PORT}/action?id=${encodeURIComponent(alertId)}&since=${startTime}`);
      if (compRes && compRes.action) {
        if (compRes.action === 'approve') {
          outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
          return;
        } else if (compRes.action === 'reject') {
          outputDecision('deny', 'Rejected remotely via HeyHuman mobile app');
          return;
        }
      }
    } catch {}

    // Check web relay
    try {
      const pollUrl = `${DEFAULT_ENDPOINT}/api/alert?room=${encodeURIComponent(room)}&since=${startTime - 1000}`;
      const webRes = await httpGetJson(pollUrl);
      if (webRes && Array.isArray(webRes.actions)) {
        for (const act of webRes.actions) {
          if (act.timestamp >= startTime) {
            if (act.action === 'approve') {
              outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
              return;
            } else if (act.action === 'reject') {
              outputDecision('deny', 'Rejected remotely via HeyHuman mobile app');
              return;
            }
          }
        }
      }
    } catch {}
  }

  // 6. Timed out waiting for mobile response: fall back to desktop prompt
  outputDecision('ask', 'No mobile response received within timeout. Falling back to desktop prompt.');
}

function outputDecision(decision, reason) {
  const result = { decision };
  if (reason) result.reason = reason;
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(urlStr, { timeout: 3000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPostJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const client = isHttps ? https : http;
    const bodyStr = JSON.stringify(bodyObj);
    const parsed = new URL(urlStr);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: 4000
    };

    const req = client.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

main().catch(() => {
  outputDecision('ask', 'Hook error');
});
