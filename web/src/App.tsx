import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  CheckCircle2, 
  Trash2, 
  Copy, 
  Check, 
  QrCode, 
  RefreshCw,
  X,
  ExternalLink,
  Bell,
  BellOff,
  Terminal,
  ArrowUpRight,
  Sparkles,
  Radio,
  Laptop,
  Code2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { audioAlertEngine } from './audioEngine';
import './App.css';

interface AlertItem {
  id: string;
  agent: string;
  type: string;
  tool?: string;
  command?: string;
  description?: string;
  questions?: Array<{
    question: string;
    options: string[];
    isMultiSelect?: boolean;
  }>;
  options?: string[];
  allowCustomInput?: boolean;
  timestamp: number;
  resolved?: boolean;
}

function extractOptions(alert: AlertItem): string[] {
  if (Array.isArray(alert.options) && alert.options.length > 0) {
    return alert.options;
  }
  if (Array.isArray(alert.questions) && alert.questions.length > 0) {
    return alert.questions[0].options || [];
  }
  if (alert.command && alert.command.includes('"options"')) {
    try {
      const parsed = JSON.parse(alert.command);
      if (Array.isArray(parsed.questions) && parsed.questions[0]?.options) {
        return parsed.questions[0].options;
      }
      if (Array.isArray(parsed.options)) {
        return parsed.options;
      }
    } catch {
      // Ignored invalid JSON in command
    }
  }
  return [];
}

const STORAGE_KEY = 'heyhuman_room';

function generateRandomKey(): string {
  const words = ['alpha', 'bravo', 'echo', 'delta', 'hyper', 'swift', 'zero', 'cyber', 'vivid', 'pulse', 'lynx', 'orbit', 'flux', 'apex', 'prism', 'nexus'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${w1}-${w2}-${num}`;
}

type VibeToolId = 'antigravity' | 'cursor' | 'copilot' | 'claude' | 'aider';

interface VibeToolConfig {
  id: VibeToolId;
  name: string;
  badge: string;
  environment: string;
  description: string;
  monitors: string[];
  settingsSnippet: string;
  extraCommand?: {
    title: string;
    command: string;
    description: string;
  };
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const paramRoom = searchParams.get('room');
  const savedRoom = localStorage.getItem(STORAGE_KEY);
  const activeRoom = (paramRoom || savedRoom || 'orbit-swift-551').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  const [room, setRoom] = useState<string>(activeRoom);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const [soundType, setSoundType] = useState<'siren' | 'alarm' | 'chime' | 'beep'>('siren');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);

  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);
  const [customInputText, setCustomInputText] = useState<string>('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(1);
  const [copiedSnippetKey, setCopiedSnippetKey] = useState<string | null>(null);

  // Navigation states
  const [mobileTab, setMobileTab] = useState<'monitor' | 'tools'>('monitor');
  const [selectedTool, setSelectedTool] = useState<VibeToolId>('antigravity');

  const lastSeenIdRef = useRef<string | null>(null);
  const pollerRef = useRef<number | null>(null);

  const roomUrl = `${window.location.origin}?room=${room}`;

  // Helper: Convert urlBase64 to Uint8Array for PushManager
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Request Web Push Subscription
  const subscribeToWebPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Web Push is not supported in this browser. On iPhone, make sure to tap Share > Add to Home Screen first!');
      return;
    }

    try {
      let perm = Notification.permission;
      if (perm !== 'granted') {
        perm = await Notification.requestPermission();
      }

      if (perm !== 'granted') {
        alert('Notification permission was not granted. Please allow notifications in your browser settings.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      
      const res = await fetch(`/api/alert?room=${encodeURIComponent(room)}`);
      const data = await res.json();
      const vapidKey = data.vapidPublicKey;

      if (!vapidKey) return;

      try {
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }
      } catch {
        // Ignore unsubscribe error
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      const sendRes = await fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe_push',
          subscription: sub
        })
      });

      const sendData = await sendRes.json();
      if (sendRes.ok) {
        setIsPushSubscribed(true);
        if (sendData.welcomeError) {
          alert(`Push server test warning: ${sendData.welcomeError}`);
        }
      }
    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : String(e);
      console.warn('Push subscription failed:', e);
      alert(`Push activation error: ${errText}`);
    }
  };

  // Save room on change & update URL
  const updateRoom = (newRoom: string) => {
    const clean = newRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setRoom(clean);
    localStorage.setItem(STORAGE_KEY, clean);
    const url = new URL(window.location.href);
    url.searchParams.set('room', clean);
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, room);
  }, [room]);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => {
          if (sub) {
            setIsPushSubscribed(true);
          }
        })
        .catch(() => {
          // Ignore background check failure
        });
    }
  }, []);

  const fireAlert = useCallback((item: AlertItem) => {
    if (isAudioUnlocked) {
      if (item.type === 'code_finish') {
        audioAlertEngine.playSound('chime');
        setTimeout(() => {
          audioAlertEngine.speak(`Hey human! ${item.agent} finished coding.`);
        }, 600);
      } else {
        audioAlertEngine.playSound(soundType);
        setTimeout(() => {
          audioAlertEngine.speak(`Hey human! ${item.agent} needs approval.`);
        }, 700);
      }
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([350, 150, 350, 150, 500]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`HeyHuman: ${item.agent}`, {
          body: item.description || 'Action awaiting your permission',
          icon: '/logo.png',
          tag: item.id
        });
      } catch {
        // Ignored
      }
    }
  }, [isAudioUnlocked, soundType]);

  // Poll room alerts from Vercel serverless relay
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/alert?room=${encodeURIComponent(room)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.alerts)) {
          const list: AlertItem[] = data.alerts;
          setAlerts(list);

          const pending = list.filter(a => !a.resolved);

          if (pending.length > 0) {
            const newest = pending[0];
            if (newest.id !== lastSeenIdRef.current) {
              lastSeenIdRef.current = newest.id;
              fireAlert(newest);
              // Auto-switch mobile view to monitor so developer instantly sees prompt
              setMobileTab('monitor');
            }
          }
        }
      } catch {
        // Silently retry on next poll
      }
    };

    fetchAlerts();
    pollerRef.current = window.setInterval(fetchAlerts, 2000);

    return () => {
      if (pollerRef.current) window.clearInterval(pollerRef.current);
    };
  }, [room, fireAlert]);

  const handleUnlockAudio = () => {
    const ok = audioAlertEngine.unlockAudio();
    if (ok) {
      setIsAudioUnlocked(true);
      audioAlertEngine.playSound('chime');
    }
  };

  const handleTestAlert = () => {
    handleUnlockAudio();
    const testItem: AlertItem = {
      id: `test_${Date.now()}`,
      agent: 'Google Antigravity',
      type: 'terminal_command',
      tool: 'Terminal',
      command: 'npx -y @vscode/vsce package --no-dependencies',
      description: 'Allow terminal command execution outside sandbox?',
      options: [
        'Yes, allow this time',
        "Yes, and always allow 'npx' in this conversation",
        "Yes, and always allow 'npx'",
        'No (tell the agent what to do instead)'
      ],
      allowCustomInput: true,
      timestamp: Date.now(),
      resolved: false
    };

    fireAlert(testItem);

    fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testItem)
    }).catch(() => {
      setAlerts(prev => [testItem, ...prev]);
    });
  };

  const handleRemoteAction = (
    id: string, 
    action: 'approve' | 'reject' | 'focus' | 'answer' | 'submit_permission',
    input?: string,
    selectionIndex?: number
  ) => {
    if (action === 'approve' || action === 'answer' || action === 'submit_permission') {
      confetti({
        particleCount: 45,
        spread: 65,
        origin: { y: 0.65 },
        colors: ['#0071e3', '#30d158', '#ffffff']
      });
    }

    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));

    fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id, 
        action, 
        input: input || (action === 'approve' ? 'y' : action === 'reject' ? 'n' : ''),
        selectionIndex,
        selectionText: input
      })
    }).catch(() => {});
  };

  const handleResolve = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));

    fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', id })
    }).catch(() => {});
  };

  const handleClear = () => {
    setAlerts([]);
    lastSeenIdRef.current = null;
    fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' })
    }).catch(() => {});
  };

  const copyRoom = () => {
    navigator.clipboard.writeText(room);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copySnippet = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippetKey(key);
    setTimeout(() => setCopiedSnippetKey(null), 2000);
  };

  const pendingAlert = alerts.find(a => !a.resolved);
  const [prevAlertId, setPrevAlertId] = useState<string | null>(null);

  if (pendingAlert && pendingAlert.id !== prevAlertId) {
    setPrevAlertId(pendingAlert.id);
    setSelectedOptionIndex(1);
    setCustomInputText('');
    setMobileTab('monitor');
  }

  const handleSubmitAntigravity = () => {
    if (!pendingAlert) return;
    const optionsList = extractOptions(pendingAlert);
    const resolvedOptions = optionsList.length > 0 ? optionsList : [
      'Yes, allow this time',
      "Yes, and always allow in this conversation",
      "Yes, and always allow",
      'No (tell the agent what to do instead)'
    ];

    const selectedText = resolvedOptions[selectedOptionIndex - 1] || '';
    const isCustom = selectedOptionIndex === 4 || selectedText.toLowerCase().includes('tell the agent');
    const finalInput = isCustom && customInputText.trim() ? customInputText.trim() : selectedText;

    handleRemoteAction(
      pendingAlert.id,
      'submit_permission',
      finalInput,
      selectedOptionIndex
    );
  };

  const handleSubmitRef = useRef(handleSubmitAntigravity);
  useEffect(() => {
    handleSubmitRef.current = handleSubmitAntigravity;
  });

  // Keyboard navigation parity: 1, 2, 3, 4 and Enter
  useEffect(() => {
    if (!pendingAlert) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === '1') {
        setSelectedOptionIndex(1);
      } else if (e.key === '2') {
        setSelectedOptionIndex(2);
      } else if (e.key === '3') {
        setSelectedOptionIndex(3);
      } else if (e.key === '4') {
        setSelectedOptionIndex(4);
      } else if (e.key === 'Enter') {
        handleSubmitRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingAlert]);

  // Vibe Coding Tool Specifications
  const vibeTools: Record<VibeToolId, VibeToolConfig> = {
    antigravity: {
      id: 'antigravity',
      name: 'Google Antigravity',
      badge: 'Zero-Touch Mobile Approvals',
      environment: 'Antigravity IDE & 2.0 Desktop',
      description: 'Real-time JSONL transcript monitor (~/.gemini/antigravity/brain) + local companion IPC bridge on port 47291 for zero-touch mobile execution.',
      monitors: [
        'Sandbox bypass approvals (BypassSandbox: true)',
        'Interactive questions & questionnaires (ask_question)',
        'Code generation completion chimes (code_finish)',
        'Blocked steps (WAITING_FOR_INPUT) & errors'
      ],
      extraCommand: {
        title: 'Enable Mobile Approvals Hook',
        command: 'HeyHuman: Enable Antigravity Mobile Approvals',
        description: 'Press Cmd+Shift+P and run this once in your project. Installs .agents/hooks.json so tapping Approve on mobile immediately executes without desktop prompt!'
      },
      settingsSnippet: `{
  // HeyHuman Master & Web Relay
  "heyhuman.enabled": true,
  "heyhuman.phoneAlerts.enabled": true,
  "heyhuman.webRoom": "${room}",

  // Agent Watcher Toggle
  "heyhuman.agents.antigravity.enabled": true,

  // Checkbox Notification Triggers (When to alert)
  "heyhuman.notifyOn.permissionNeeded": true,
  "heyhuman.notifyOn.codeFinish": true,
  "heyhuman.notifyOn.questionInput": true,
  "heyhuman.notifyOn.taskError": true,
  "heyhuman.notifyOn.subagentMilestone": false,

  // Alert Sound
  "heyhuman.sound.type": "${soundType}",
  "heyhuman.sound.volume": 80
}`
    },
    cursor: {
      id: 'cursor',
      name: 'Cursor Agent',
      badge: 'Composer & Terminal',
      environment: 'Cursor IDE / Composer',
      description: 'Observes Cursor workspace storage, Composer execution logs, and confirmation modals requiring user action.',
      monitors: [
        'Composer command execution dialogs',
        'Terminal scripts and tools requiring approval',
        'Workspace multi-file edits awaiting review',
        'Task completion events'
      ],
      settingsSnippet: `{
  "heyhuman.enabled": true,
  "heyhuman.phoneAlerts.enabled": true,
  "heyhuman.webRoom": "${room}",

  "heyhuman.agents.cursor.enabled": true,
  "heyhuman.notifyOn.permissionNeeded": true,
  "heyhuman.notifyOn.codeFinish": true,
  "heyhuman.notifyOn.taskError": true
}`
    },
    copilot: {
      id: 'copilot',
      name: 'GitHub Copilot',
      badge: 'Agent Mode & Chat',
      environment: 'VS Code & Copilot Agent Mode',
      description: 'Monitors Copilot chat storage transcripts and background process output for terminal execution and tool approvals.',
      monitors: [
        'Terminal execution confirmation prompts',
        'Tool invocations (prepareInvocation)',
        'Script sandbox execution approvals',
        'Agent response completion'
      ],
      settingsSnippet: `{
  "heyhuman.enabled": true,
  "heyhuman.phoneAlerts.enabled": true,
  "heyhuman.webRoom": "${room}",

  "heyhuman.agents.copilot.enabled": true,
  "heyhuman.notifyOn.permissionNeeded": true,
  "heyhuman.notifyOn.codeFinish": true
}`
    },
    claude: {
      id: 'claude',
      name: 'Claude Code',
      badge: 'Terminal CLI Agent',
      environment: 'Anthropic claude CLI in Integrated Terminal',
      description: 'Monitors Claude Code terminal output streams and confirmation regex for bash commands and tool calls.',
      monitors: [
        'Bash command execution approval prompts ([y/n])',
        'File modification authorizations',
        'Task finish & turn completion chimes',
        'Command errors'
      ],
      settingsSnippet: `{
  "heyhuman.enabled": true,
  "heyhuman.phoneAlerts.enabled": true,
  "heyhuman.webRoom": "${room}",

  "heyhuman.agents.claude.enabled": true,
  "heyhuman.notifyOn.permissionNeeded": true,
  "heyhuman.notifyOn.codeFinish": true
}`
    },
    aider: {
      id: 'aider',
      name: 'Aider',
      badge: 'Pair Programming CLI',
      environment: 'aider CLI & .aider.chat.history.md',
      description: 'Watches aider chat logs and active terminal sessions for command execution confirmation and code changes.',
      monitors: [
        'Shell command execution prompts ((y)es/(n)o)',
        'Git auto-commit approvals',
        'Code changes applied'
      ],
      settingsSnippet: `{
  "heyhuman.enabled": true,
  "heyhuman.phoneAlerts.enabled": true,
  "heyhuman.webRoom": "${room}",

  "heyhuman.agents.aider.enabled": true,
  "heyhuman.notifyOn.permissionNeeded": true,
  "heyhuman.notifyOn.codeFinish": true
}`
    }
  };

  const activeVibe = vibeTools[selectedTool];

  return (
    <div className="app-shell">
      
      {/* 1. Header Navigation */}
      <header className="app-header">
        <div className="header-top-row">
          <div className="brand-section">
            <img src="/logo.svg" alt="HeyHuman" className="brand-logo" />
            <div className="brand-text-wrap">
              <span className="brand-title">
                HeyHuman <Sparkles size={13} style={{ color: 'var(--accent-amber)' }} />
              </span>
              <span className="brand-tag">Vibe Coding Alert Station</span>
            </div>
          </div>

          {/* Room Pill in top row */}
          <div className="header-center">
            <div className="pill-button" onClick={() => setShowQR(true)} title="Click to view QR code or change room">
              <Radio size={12} style={{ color: 'var(--accent-green)' }} />
              <span className="room-badge-text">{room}</span>
              <QrCode size={11} style={{ opacity: 0.6 }} />
            </div>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="header-actions">
          {/* Push Notifications Toggle Pill */}
          <button
            onClick={subscribeToWebPush}
            className={`pill-button ${isPushSubscribed ? 'active-green' : ''}`}
            title={isPushSubscribed ? 'Web Push Active: Wakes your phone when screen is locked' : 'Enable Web Push for lock screen alerts'}
          >
            {isPushSubscribed ? <Bell size={13} /> : <BellOff size={13} />}
            <span>{isPushSubscribed ? 'Push On' : 'Lock Alert'}</span>
          </button>

          {/* Audio Unmute Pill */}
          <button
            onClick={isAudioUnlocked ? () => setIsAudioUnlocked(false) : handleUnlockAudio}
            className={`pill-button ${isAudioUnlocked ? 'active-green' : ''}`}
            title={isAudioUnlocked ? 'Siren sound active' : 'Click to enable sirens and voice speech'}
          >
            {isAudioUnlocked ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{isAudioUnlocked ? 'Sound On' : 'Sound'}</span>
          </button>

          {/* Test Simulation Button */}
          <button onClick={handleTestAlert} className="pill-button primary" title="Simulate a real AI permission alert">
            <Sparkles size={13} />
            <span>Test Alert</span>
          </button>
        </div>
      </header>

      {/* Mobile Segmented View Control */}
      <div className="segmented-nav-wrap">
        <div className="segmented-nav">
          <button
            onClick={() => setMobileTab('monitor')}
            className={`segmented-nav-item ${mobileTab === 'monitor' ? 'active' : ''}`}
          >
            <Radio size={14} />
            <span>Live Station</span>
            {pendingAlert && <span className="alert-counter-badge">1</span>}
          </button>

          <button
            onClick={() => setMobileTab('tools')}
            className={`segmented-nav-item ${mobileTab === 'tools' ? 'active' : ''}`}
          >
            <Laptop size={14} />
            <span>Connect Tools</span>
          </button>
        </div>
      </div>

      {/* 2. Main Dashboard Layout (Dual-Column Desktop, Adaptive Mobile) */}
      <main className="dashboard-grid">
        
        {/* ======================================================== */}
        {/* LEFT COLUMN: LIVE MONITOR & REMOTE CONTROL STATION        */}
        {/* ======================================================== */}
        <div className={`monitor-column ${mobileTab !== 'monitor' ? 'tab-pane-mobile-hidden' : ''}`}>
          
          {pendingAlert ? (
            /* ACTIVE ALERT: High-precision native modal */
            <div className="active-alert-wrapper">
              <div className="alert-top-badge-row">
                <div className="alert-agent-tag">
                  <ShieldAlert size={12} />
                  <span>{pendingAlert.agent}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(pendingAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              {/* Native Dialogue Card */}
              {(() => {
                const isAntigravity = pendingAlert.agent.toLowerCase().includes('antigravity');
                const isCopilot = pendingAlert.agent.toLowerCase().includes('copilot');
                const isClaude = pendingAlert.agent.toLowerCase().includes('claude');
                const extractedOpts = extractOptions(pendingAlert);
                const hasOptions = extractedOpts.length > 0;

                // Antigravity & Multi-Choice Modal
                if (isAntigravity || hasOptions) {
                  const defaultAgOptions = [
                    'Yes, allow this time',
                    "Yes, and always allow in this conversation",
                    "Yes, and always allow",
                    'No (tell the agent what to do instead)'
                  ];
                  const resolvedOptions = extractedOpts.length > 0 ? extractedOpts : defaultAgOptions;

                  let displayTitle = pendingAlert.description || 'Allow action?';
                  if (!displayTitle.toLowerCase().startsWith('allow')) {
                    displayTitle = `Allow ${displayTitle.replace(/\?$/, '')}?`;
                  }

                  return (
                    <div className="agent-modal-card">
                      <div className="agent-modal-header">
                        <div className="agent-modal-icon">
                          <Terminal size={15} strokeWidth={2.2} />
                        </div>
                        <h2 className="agent-modal-title">{displayTitle}</h2>
                      </div>

                      {pendingAlert.command && !(pendingAlert.command.trim().startsWith('{') || pendingAlert.command.trim().startsWith('[')) && (
                        <div className="command-box">
                          <code>{pendingAlert.command}</code>
                        </div>
                      )}

                      <div className="modal-options-list">
                        {resolvedOptions.map((opt, idx) => {
                          const optNumber = idx + 1;
                          const isSelected = selectedOptionIndex === optNumber;
                          const isCustomRow = optNumber === 4 || opt.toLowerCase().includes('tell the agent') || opt.toLowerCase().includes('other');

                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedOptionIndex(optNumber)}
                                className={`option-row-btn ${isSelected ? 'selected' : ''}`}
                              >
                                <span className="option-key-badge">{optNumber}</span>
                                <span className="option-label">{opt}</span>
                              </button>

                              {isSelected && isCustomRow && (
                                <div className="custom-reply-inset">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={customInputText}
                                    onChange={e => setCustomInputText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSubmitAntigravity();
                                    }}
                                    placeholder="Tell the agent what to do instead..."
                                    className="custom-reply-input"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="agent-modal-footer">
                        <button
                          type="button"
                          onClick={() => handleRemoteAction(pendingAlert.id, 'reject', 'Skip', 4)}
                          className="skip-btn"
                        >
                          Skip
                        </button>

                        <button
                          type="button"
                          onClick={handleSubmitAntigravity}
                          className="submit-btn"
                        >
                          <span>Submit</span>
                          <span style={{ fontSize: '1rem', lineHeight: '1' }}>↵</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // GitHub Copilot Card
                if (isCopilot) {
                  return (
                    <div className="agent-modal-card" style={{ borderColor: 'rgba(56, 139, 253, 0.3)' }}>
                      <div className="agent-modal-header">
                        <div className="agent-modal-icon" style={{ background: 'rgba(56, 139, 253, 0.15)', color: '#58a6ff' }}>
                          <Terminal size={15} />
                        </div>
                        <div>
                          <h2 className="agent-modal-title">GitHub Copilot</h2>
                          <span style={{ fontSize: '0.74rem', color: '#8b949e' }}>Execution permission requested</span>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.86rem', color: '#c9d1d9', lineHeight: '1.4' }}>
                        {pendingAlert.description}
                      </p>

                      {pendingAlert.command && (
                        <div className="command-box">
                          <code style={{ color: '#79c0ff' }}>{pendingAlert.command}</code>
                        </div>
                      )}

                      <div className="alert-actions-grid">
                        <button
                          onClick={() => handleRemoteAction(pendingAlert.id, 'approve', 'y')}
                          style={{
                            background: '#238636',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            cursor: 'pointer'
                          }}
                        >
                          <CheckCircle2 size={16} /> Allow (Run)
                        </button>

                        <button
                          onClick={() => handleRemoteAction(pendingAlert.id, 'reject', 'n')}
                          style={{
                            background: 'rgba(248, 81, 73, 0.12)',
                            color: '#f85149',
                            border: '1px solid rgba(248, 81, 73, 0.3)',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                // Claude Code Card
                if (isClaude) {
                  return (
                    <div className="agent-modal-card" style={{ borderColor: 'rgba(234, 88, 12, 0.3)' }}>
                      <div className="agent-modal-header">
                        <div className="agent-modal-icon" style={{ background: 'rgba(234, 88, 12, 0.15)', color: '#f97316' }}>
                          <Terminal size={15} />
                        </div>
                        <div>
                          <h2 className="agent-modal-title">Claude Code</h2>
                          <span style={{ fontSize: '0.74rem', color: '#a8a29e' }}>Terminal execution requested</span>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.86rem', color: '#e7e5e4', lineHeight: '1.4' }}>
                        {pendingAlert.description}
                      </p>

                      {pendingAlert.command && (
                        <div className="command-box">
                          <code style={{ color: '#fdba74' }}>{pendingAlert.command}</code>
                        </div>
                      )}

                      <div className="alert-actions-grid">
                        <button
                          onClick={() => handleRemoteAction(pendingAlert.id, 'approve', 'y')}
                          style={{
                            background: '#ea580c',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            cursor: 'pointer'
                          }}
                        >
                          <CheckCircle2 size={16} /> Allow (y)
                        </button>

                        <button
                          onClick={() => handleRemoteAction(pendingAlert.id, 'reject', 'n')}
                          style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: '#f87171',
                            border: '1px solid rgba(248, 113, 113, 0.3)',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Deny (n)
                        </button>
                      </div>
                    </div>
                  );
                }

                // Default Agent Fallback
                return (
                  <div className="agent-modal-card">
                    <h2 className="agent-modal-title">Permission Required</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{pendingAlert.description}</p>
                    {pendingAlert.command && (
                      <div className="command-box">
                        <code style={{ color: '#38bdf8' }}>{pendingAlert.command}</code>
                      </div>
                    )}
                    <div className="alert-actions-grid">
                      <button
                        onClick={() => handleRemoteAction(pendingAlert.id, 'approve')}
                        className="submit-btn"
                        style={{ justifyContent: 'center' }}
                      >
                        <CheckCircle2 size={16} /> Approve
                      </button>
                      <button
                        onClick={() => handleRemoteAction(pendingAlert.id, 'reject')}
                        className="skip-btn"
                        style={{ border: '1px solid var(--border)', textAlign: 'center' }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Auxiliary Controls Below Card */}
              <div className="auxiliary-btn-row">
                <button
                  onClick={() => handleRemoteAction(pendingAlert.id, 'focus')}
                  title="Raise desktop editor to foreground"
                  className="bring-ide-btn"
                >
                  <Laptop size={14} />
                  <span>Bring IDE to Front</span>
                  <ArrowUpRight size={13} style={{ opacity: 0.6 }} />
                </button>

                <button onClick={() => handleResolve(pendingAlert.id)} className="skip-btn" style={{ fontSize: '0.78rem' }}>
                  Silence Only
                </button>
              </div>
            </div>
          ) : (
            /* CALM STATE: Radar Beacon Station */
            <div className="beacon-card">
              <div className="beacon-radar-wrap">
                <div className="radar-ring" />
                <div className="beacon-center-dot" />
              </div>

              <div>
                <h2 className="beacon-title">
                  Listening on "{room}"
                </h2>
                <p className="beacon-desc">
                  Your phone will sound sirens and vibrate when your AI coding agent pauses for approval or finishes a task.
                </p>
              </div>

              {/* Room Bar */}
              <div className="room-bar">
                <input 
                  type="text"
                  value={room}
                  onChange={e => updateRoom(e.target.value)}
                  placeholder="room-name"
                  className="room-input"
                />
                <button onClick={() => updateRoom(generateRandomKey())} title="Rotate Room Key" className="icon-btn">
                  <RefreshCw size={13} />
                </button>
                <button onClick={() => setShowQR(true)} title="Pair Phone via QR" className="icon-btn">
                  <QrCode size={13} />
                </button>
                <button onClick={copyRoom} className={`copy-btn ${isCopied ? 'copied' : ''}`}>
                  {isCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Siren Tone Switcher Card */}
          <div className="surface-card" style={{ padding: '0.85rem 1.15rem' }}>
            <div className="tone-selector-bar">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600 }}>Emergency Tone</span>
              <div className="tone-pills">
                {(['siren', 'alarm', 'chime', 'beep'] as const).map(tone => (
                  <button
                    key={tone}
                    onClick={() => {
                      setSoundType(tone);
                      if (isAudioUnlocked) audioAlertEngine.playSound(tone);
                    }}
                    className={`tone-pill-btn ${soundType === tone ? 'active' : ''}`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity Feed */}
          {alerts.length > 0 && (
            <div className="surface-card">
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-title">Live Activity</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>({alerts.length})</span>
                </div>
                <button onClick={handleClear} className="skip-btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Trash2 size={12} /> Clear
                </button>
              </div>

              <div className="activity-card">
                {alerts.slice(0, 5).map(item => (
                  <div key={item.id} className={`activity-item ${item.resolved ? 'resolved' : ''}`}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="activity-agent-name">{item.agent}</span>
                        {item.type === 'code_finish' && (
                          <span style={{ fontSize: '0.65rem', background: 'var(--accent-blue-tint)', color: 'var(--accent-blue)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                            Finished
                          </span>
                        )}
                      </div>
                      <p className="activity-desc" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.description || item.command || 'Permission requested'}
                      </p>
                    </div>
                    <span className="activity-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: VIBE CODING TOOLS CONNECTION & SETTINGS     */}
        {/* ======================================================== */}
        <div className={`vibe-column ${mobileTab === 'tools' ? '' : 'tab-pane-mobile-hidden'}`}>
          
          <div className="surface-card">
            <div className="vibe-header">
              <div className="vibe-title-row">
                <h2 className="vibe-main-title">
                  <Laptop size={18} style={{ color: 'var(--accent-blue)' }} />
                  <span>Connect with Vibe Coding Tools</span>
                </h2>
                <span style={{ fontSize: '0.72rem', background: 'var(--accent-green-tint)', color: 'var(--accent-green)', padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 600 }}>
                  Ready to pair
                </span>
              </div>
              <p className="vibe-desc">
                Follow the 3-step setup below for your AI coding environment. Once configured, your desktop extension will automatically relay prompts and code completion chimes to this room.
              </p>
            </div>

            {/* Tool Selection Tabs */}
            <div style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
              <div className="tool-selector-bar">
                {(Object.keys(vibeTools) as VibeToolId[]).map(tId => {
                  const tool = vibeTools[tId];
                  return (
                    <button
                      key={tId}
                      onClick={() => setSelectedTool(tId)}
                      className={`tool-tab-btn ${selectedTool === tId ? 'active' : ''}`}
                    >
                      <Code2 size={14} />
                      <span>{tool.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Tool Step-by-Step Connection Guide */}
            <div className="guide-steps-grid">
              
              {/* Step 1: Install Extension */}
              <div className="guide-step-card">
                <div className="step-header">
                  <span className="step-num-badge">1</span>
                  <span className="step-title">Install HeyHuman Extension</span>
                </div>
                <p className="step-desc">
                  Install <strong>HeyHuman</strong> from the VS Code / Cursor Extension Marketplace (search <code>akdey.heyhuman</code>) or via terminal command:
                </p>
                <div className="code-block-card">
                  <div className="code-block-header">
                    <span className="code-lang-tag">Terminal</span>
                    <button 
                      onClick={() => copySnippet('ext-install', 'code --install-extension akdey.heyhuman')}
                      className="code-copy-action"
                    >
                      {copiedSnippetKey === 'ext-install' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                      <span>{copiedSnippetKey === 'ext-install' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="code-content">code --install-extension akdey.heyhuman</pre>
                </div>
              </div>

              {/* Step 2: Pair Room ID */}
              <div className="guide-step-card">
                <div className="step-header">
                  <span className="step-num-badge">2</span>
                  <span className="step-title">Pair Your Room ID in Editor</span>
                </div>
                <p className="step-desc">
                  Press <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.78rem' }}>Cmd+Shift+P</kbd> (or <kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.78rem' }}>Ctrl+Shift+P</kbd>) &rarr; select <strong>HeyHuman: Set Web Room ID</strong> &rarr; enter:
                </p>
                <div className="code-block-card">
                  <div className="code-block-header">
                    <span className="code-lang-tag">Your Room ID</span>
                    <button 
                      onClick={() => copySnippet('room-code', room)}
                      className="code-copy-action"
                    >
                      {copiedSnippetKey === 'room-code' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                      <span>{copiedSnippetKey === 'room-code' ? 'Copied' : 'Copy Room ID'}</span>
                    </button>
                  </div>
                  <pre className="code-content" style={{ color: 'var(--accent-blue)' }}>{room}</pre>
                </div>
              </div>

              {/* Step 3: Settings & Notification Checkboxes */}
              <div className="guide-step-card">
                <div className="step-header">
                  <span className="step-num-badge">3</span>
                  <span className="step-title">Enable Phone Alerts & Notification Triggers</span>
                </div>
                <p className="step-desc">
                  In VS Code Settings (<kbd style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.78rem' }}>Cmd+,</kbd> search <code>HeyHuman</code>) or paste into your <code>settings.json</code>:
                </p>
                <div className="code-block-card">
                  <div className="code-block-header">
                    <span className="code-lang-tag">settings.json</span>
                    <button 
                      onClick={() => copySnippet('settings-json', activeVibe.settingsSnippet)}
                      className="code-copy-action"
                    >
                      {copiedSnippetKey === 'settings-json' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                      <span>{copiedSnippetKey === 'settings-json' ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                  <pre className="code-content">{activeVibe.settingsSnippet}</pre>
                </div>

                {/* Monitored Event Types */}
                <div style={{ marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Active Triggers for {activeVibe.name}:
                  </span>
                  <div className="triggers-badge-row">
                    {activeVibe.monitors.map((mon, idx) => (
                      <span key={idx} className="trigger-chip checked">
                        <Check size={11} color="var(--accent-green)" />
                        <span>{mon}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 4: Special Hook (If Tool has extraCommand e.g. Antigravity) */}
              {activeVibe.extraCommand && (
                <div className="guide-step-card" style={{ borderColor: 'rgba(0, 113, 227, 0.3)', background: 'rgba(0, 113, 227, 0.04)' }}>
                  <div className="step-header">
                    <span className="step-num-badge" style={{ background: 'var(--accent-blue)', color: '#ffffff' }}>★</span>
                    <span className="step-title" style={{ color: '#ffffff' }}>{activeVibe.extraCommand.title}</span>
                  </div>
                  <p className="step-desc">
                    {activeVibe.extraCommand.description}
                  </p>
                  <div className="code-block-card">
                    <div className="code-block-header">
                      <span className="code-lang-tag">Command Palette</span>
                      <button 
                        onClick={() => copySnippet('hook-cmd', activeVibe.extraCommand!.command)}
                        className="code-copy-action"
                      >
                        {copiedSnippetKey === 'hook-cmd' ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
                        <span>{copiedSnippetKey === 'hook-cmd' ? 'Copied' : 'Copy Command'}</span>
                      </button>
                    </div>
                    <pre className="code-content" style={{ color: '#38bdf8' }}>{activeVibe.extraCommand.command}</pre>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </main>

      {/* 3. QR Code Pairing Modal Dialog */}
      {showQR && (
        <div className="modal-scrim" onClick={() => setShowQR(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowQR(false)} className="modal-close-btn" title="Close QR">
              <X size={16} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>Pair Your Smartphone</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                Scan with your phone camera to stream emergency sirens and approve prompts from anywhere.
              </p>
            </div>

            <div className="qr-code-frame">
              <QRCodeSVG 
                value={roomUrl} 
                size={180}
                level="H"
                imageSettings={{
                  src: '/logo.svg',
                  x: undefined,
                  y: undefined,
                  height: 40,
                  width: 40,
                  excavate: true
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                Room Channel: <strong style={{ color: 'var(--accent-blue)' }}>{room}</strong>
              </span>
              <button 
                onClick={copyRoom} 
                className="submit-btn" 
                style={{ width: '100%', justifyContent: 'center', padding: '0.65rem' }}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>{isCopied ? 'Room Link Copied' : 'Copy Mobile Link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Footer */}
      <footer className="app-footer">
        <span>Designed & Engineered by</span>
        <a 
          href="https://portfolio.akdey.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          AMIT KUMAR DEY <ExternalLink size={11} />
        </a>
      </footer>

    </div>
  );
}

export default App;
