#!/usr/bin/env node
/**
 * HeyHuman Antigravity Lifecycle Hook
 * Intercepts tool calls (e.g. run_command with BypassSandbox: true or permission prompts).
 * When approval is required:
 *   1. Emits alert to HeyHuman companion and mobile room.
 *   2. Waits up to 35s for mobile action (Approve / Reject / Option submit).
 *   3. If approved via phone: outputs { "decision": "allow" } -> Antigravity runs immediately!
 *   4. If rejected via phone: outputs { "decision": "deny", "reason": "..." } -> Antigravity cancels tool.
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
  let inputRaw = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    inputRaw += chunk;
  }

  let payload = {};
  try {
    payload = JSON.parse(inputRaw || '{}');
  } catch {
    outputDecision('ask', 'Could not parse hook input');
    return;
  }

  const toolCall = payload.toolCall || {};
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};
  const stepIdx = payload.stepIdx ?? 0;

  const isBypass = args.BypassSandbox === true || args.BypassSandbox === 'true';
  const cmdStr = (args.CommandLine || '').toLowerCase();
  const isDestructive = cmdStr.includes('rm -rf') || cmdStr.includes('git reset --hard') || cmdStr.includes('npm publish') || cmdStr.includes('drop database');
  const isSensitive = isBypass || toolName === 'ask_question' || toolName.includes('run_command') || isDestructive;

  if (!isSensitive) {
    outputDecision('allow');
    return;
  }

  const commandStr = args.CommandLine || toolName;
  const alertId = `ag-step-${stepIdx}-hook-${Date.now()}`;

  let phoneAlertsEnabled = false;
  let room = process.env.HEYHUMAN_ROOM || '';
  let endpoint = DEFAULT_ENDPOINT;

  try {
    const companionStatus = await httpGetJson(`http://127.0.0.1:${COMPANION_PORT}/status`);
    if (companionStatus) {
      if (!room && companionStatus.room) room = companionStatus.room;
      if (companionStatus.phoneAlertsEnabled !== undefined) {
        phoneAlertsEnabled = Boolean(companionStatus.phoneAlertsEnabled);
      }
      if (companionStatus.webEndpoint) {
        endpoint = companionStatus.webEndpoint;
      }
    }
  } catch {}

  if (!room || !phoneAlertsEnabled) {
    try {
      const settingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (!room) room = s['heyhuman.webRoom'] || '';
        if (s['heyhuman.phoneAlerts.enabled'] !== undefined) {
          phoneAlertsEnabled = Boolean(s['heyhuman.phoneAlerts.enabled']);
        }
        if (s['heyhuman.webEndpoint']) {
          endpoint = s['heyhuman.webEndpoint'];
        }
      }
    } catch {}
  }

  if (!room) {
    room = 'orbit-swift-551';
  }

  const standardOptions = [
    'Yes, allow this time',
    'Yes, and always allow in this conversation',
    'Yes, and always allow',
    'No (tell the agent what to do instead)'
  ];

  const alertPayload = {
    id: alertId,
    agent: 'ANTIGRAVITY',
    type: toolName === 'ask_question' ? 'Question / Clarification' : 'Permission Request',
    tool: toolName,
    command: String(commandStr).slice(0, 200),
    description: `Antigravity wants to run: ${String(commandStr).slice(0, 120)}`,
    details: String(commandStr),
    options: standardOptions,
    allowCustomInput: true,
    timestamp: Date.now()
  };

  // 1. Notify local companion server
  httpPostJson(`http://127.0.0.1:${COMPANION_PORT}/alert`, alertPayload).catch(() => {});

  // 2. Notify web relay for phone & push notifications
  if (phoneAlertsEnabled && room) {
    const webUrl = `${endpoint.replace(/\/+$/, '')}/api/alert?room=${encodeURIComponent(room)}`;
    await httpPostJson(webUrl, alertPayload).catch(() => {});
  }

  const startTime = Date.now();
  const maxWaitMs = TIMEOUT_SECONDS * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(600);

    // 1. Check local companion server
    try {
      const compRes = await httpGetJson(`http://127.0.0.1:${COMPANION_PORT}/action?id=${encodeURIComponent(alertId)}&since=${startTime}`);
      if (compRes && compRes.action) {
        if (isActionApproved(compRes)) {
          outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
          return;
        } else if (isActionRejected(compRes)) {
          const reason = compRes.input && compRes.input !== 'n' ? compRes.input : 'Rejected remotely via HeyHuman mobile app';
          outputDecision('deny', reason);
          return;
        }
      }
    } catch {}

    // 2. Check web relay
    if (phoneAlertsEnabled && room) {
      try {
        const pollUrl = `${endpoint.replace(/\/+$/, '')}/api/alert?room=${encodeURIComponent(room)}&since=${startTime - 1000}`;
        const webRes = await httpGetJson(pollUrl);
        if (webRes && Array.isArray(webRes.actions)) {
          for (const act of webRes.actions) {
            if (act.timestamp >= startTime) {
              if (isActionApproved(act)) {
                outputDecision('allow', 'Approved remotely via HeyHuman mobile app');
                return;
              } else if (isActionRejected(act)) {
                const reason = act.input && act.input !== 'n' ? act.input : 'Rejected remotely via HeyHuman mobile app';
                outputDecision('deny', reason);
                return;
              }
            }
          }
        }
      } catch {}
    }
  }

  outputDecision('ask', 'No mobile response received within timeout. Falling back to desktop prompt.');
}

function isActionApproved(actionObj) {
  if (!actionObj) return false;
  const act = actionObj.action;
  const idx = actionObj.selectionIndex;
  if (act === 'approve' || act === 'allow') return true;
  if (act === 'submit_permission' || act === 'answer') {
    return idx === undefined || idx === null || idx === 1 || idx === 2 || idx === 3;
  }
  return false;
}

function isActionRejected(actionObj) {
  if (!actionObj) return false;
  const act = actionObj.action;
  const idx = actionObj.selectionIndex;
  if (act === 'reject' || act === 'deny') return true;
  if ((act === 'submit_permission' || act === 'answer') && idx === 4) return true;
  return false;
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
