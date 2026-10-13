import { useState, useEffect, useRef } from 'react';
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
  ArrowUpRight
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { audioAlertEngine } from './audioEngine';

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
    } catch {}
  }
  return [];
}

const STORAGE_KEY = 'heyhuman_room';

function generateRandomKey(): string {
  const words = ['alpha', 'bravo', 'echo', 'delta', 'hyper', 'swift', 'zero', 'cyber', 'vivid', 'pulse', 'lynx', 'orbit', 'flux', 'apex'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${w1}-${w2}-${num}`;
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const paramRoom = searchParams.get('room');
  const savedRoom = localStorage.getItem(STORAGE_KEY);
  const activeRoom = (paramRoom || savedRoom || 'akdey').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  const [room, setRoom] = useState<string>(activeRoom);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const [soundType, setSoundType] = useState<'siren' | 'alarm' | 'chime' | 'beep'>('siren');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);

  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);
  const [customInputText, setCustomInputText] = useState<string>('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(1);

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
      alert('Web Push is not supported in this browser. On iPhone, make sure to add the app to Home Screen first!');
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
      
      // Get public VAPID key
      const res = await fetch(`/api/alert?room=${encodeURIComponent(room)}`);
      const data = await res.json();
      const vapidKey = data.vapidPublicKey;

      if (!vapidKey) return;

      // Unsubscribe existing stale subscription to guarantee fresh key sync
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

      // Send subscription to server
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
    } catch (e: any) {
      console.warn('Push subscription failed:', e);
      alert(`Push activation error: ${e?.message || e}`);
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
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      subscribeToWebPush();
    }
  }, [room]);

  // Request browser notification permission and register push
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribeToWebPush();
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            subscribeToWebPush();
          }
        });
      }
    }
  }, []);

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
  }, [room, isAudioUnlocked, soundType]);

  const fireAlert = (item: AlertItem) => {
    if (isAudioUnlocked) {
      audioAlertEngine.playSound(soundType);
      setTimeout(() => {
        audioAlertEngine.speak(`Hey human! ${item.agent} needs approval.`);
      }, 700);
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
  };

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
      command: 'npx -y @vscode/vsce package',
      description: 'Allow re-package extension into VSIX?',
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
        particleCount: 50,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#0071e3', '#34c759', '#ffffff']
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
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.6 }
    });

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

  const pendingAlert = alerts.find(a => !a.resolved);

  useEffect(() => {
    if (pendingAlert) {
      setSelectedOptionIndex(1);
      setCustomInputText('');
    }
  }, [pendingAlert?.id]);

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
        handleSubmitAntigravity();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingAlert, selectedOptionIndex, customInputText]);

  return (
    <div style={{
      maxWidth: '560px',
      margin: '0 auto',
      padding: '1.5rem 1.25rem 3rem 1.25rem',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}>
      
      {/* 1. Header (Ultra Clean) */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <img src="/logo.svg" alt="HeyHuman" style={{ width: '28px', height: '28px' }} />
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>HeyHuman</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Lock Screen Push Status Pill */}
          <button
            onClick={subscribeToWebPush}
            title={isPushSubscribed ? 'Web Push Active: Alerts will wake your phone when locked' : 'Enable Web Push for lock screen alerts'}
            style={{
              background: isPushSubscribed ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${isPushSubscribed ? 'rgba(52, 199, 89, 0.3)' : 'var(--border)'}`,
              color: isPushSubscribed ? 'var(--accent-green)' : 'var(--text-3)',
              borderRadius: '999px',
              padding: '0.35rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              cursor: 'pointer'
            }}
          >
            {isPushSubscribed ? <Bell size={13} /> : <BellOff size={13} />}
            {isPushSubscribed ? 'Push Active' : 'Lock Alert'}
          </button>



          {/* Audio State Pill */}
          <button
            onClick={isAudioUnlocked ? () => setIsAudioUnlocked(false) : handleUnlockAudio}
            style={{
              background: isAudioUnlocked ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${isAudioUnlocked ? 'rgba(52, 199, 89, 0.3)' : 'var(--border)'}`,
              color: isAudioUnlocked ? 'var(--accent-green)' : 'var(--text-2)',
              borderRadius: '999px',
              padding: '0.35rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              cursor: 'pointer'
            }}
          >
            {isAudioUnlocked ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {isAudioUnlocked ? 'Sound On' : 'Sound'}
          </button>

          <button
            onClick={handleTestAlert}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              borderRadius: '999px',
              padding: '0.35rem 0.7rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Test
          </button>
        </div>
      </header>

      {/* 2. Hero Status / Alarm Beacon */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
        
        {/* BIG HERO: Active Alarm OR Listening Radar */}
        {pendingAlert ? (
          <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            
            {/* Top Status Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'rgba(255, 59, 48, 0.15)',
                border: '1px solid rgba(255, 59, 48, 0.35)',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                color: 'var(--accent-red)',
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                <ShieldAlert size={12} />
                <span>{pendingAlert.agent}</span>
              </div>

              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 500 }}>
                {new Date(pendingAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Agent Specific Card Rendering */}
            {(() => {
              const isAntigravity = pendingAlert.agent.toLowerCase().includes('antigravity');
              const isCopilot = pendingAlert.agent.toLowerCase().includes('copilot');
              const isClaude = pendingAlert.agent.toLowerCase().includes('claude');
              const extractedOpts = extractOptions(pendingAlert);
              const hasOptions = extractedOpts.length > 0;

              // CASE 1: Google Antigravity (Exact match to desktop screenshot media_1791905862677.png)
              if (isAntigravity || hasOptions) {
                const defaultAgOptions = [
                  'Yes, allow this time',
                  "Yes, and always allow in this conversation",
                  "Yes, and always allow",
                  'No (tell the agent what to do instead)'
                ];
                const resolvedOptions = extractedOpts.length > 0 ? extractedOpts : defaultAgOptions;

                // Title formatting: "Allow <action>?"
                let displayTitle = pendingAlert.description || 'Allow action?';
                if (!displayTitle.toLowerCase().startsWith('allow')) {
                  displayTitle = `Allow ${displayTitle.replace(/\?$/, '')}?`;
                }

                return (
                  <div style={{
                    background: '#1e1e20',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '16px',
                    padding: '1.25rem 1.25rem 1rem 1.25rem',
                    boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 2px rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.9rem',
                    textAlign: 'left'
                  }}>
                    {/* 1. Header with Terminal Icon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#e4e4e7',
                        flexShrink: 0
                      }}>
                        <Terminal size={15} strokeWidth={2.2} />
                      </div>
                      <h2 style={{
                        fontSize: '0.98rem',
                        fontWeight: 600,
                        letterSpacing: '-0.015em',
                        color: '#ffffff',
                        margin: 0,
                        lineHeight: '1.3'
                      }}>
                        {displayTitle}
                      </h2>
                    </div>

                    {/* 2. Inset Monospace Command Box */}
                    {pendingAlert.command && !(pendingAlert.command.trim().startsWith('{') || pendingAlert.command.trim().startsWith('[')) && (
                      <div style={{
                        background: '#121214',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.75rem 0.95rem',
                        overflowX: 'auto'
                      }}>
                        <code style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          fontSize: '0.84rem',
                          color: '#f4f4f5',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          display: 'block',
                          lineHeight: '1.45'
                        }}>
                          {pendingAlert.command}
                        </code>
                      </div>
                    )}

                    {/* 3. Numbered Option Rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.1rem' }}>
                      {resolvedOptions.map((opt, idx) => {
                        const optNumber = idx + 1;
                        const isSelected = selectedOptionIndex === optNumber;
                        const isCustomRow = optNumber === 4 || opt.toLowerCase().includes('tell the agent') || opt.toLowerCase().includes('other');

                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedOptionIndex(optNumber)}
                              style={{
                                background: isSelected ? 'rgba(255, 255, 255, 0.11)' : 'transparent',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '0.6rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                                transition: 'background 0.12s ease'
                              }}
                            >
                              <span style={{
                                background: isSelected ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.07)',
                                color: isSelected ? '#ffffff' : '#9ca3af',
                                borderRadius: '4px',
                                width: '22px',
                                height: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                flexShrink: 0
                              }}>
                                {optNumber}
                              </span>
                              <span style={{
                                color: isSelected ? '#ffffff' : '#d4d4d8',
                                fontSize: '0.88rem',
                                fontWeight: isSelected ? 500 : 400,
                                lineHeight: '1.35',
                                flex: 1
                              }}>
                                {opt}
                              </span>
                            </button>

                            {/* Expandable input when Option 4 / Tell the agent is active */}
                            {isSelected && isCustomRow && (
                              <div style={{
                                marginTop: '0.4rem',
                                paddingLeft: '2.5rem',
                                paddingRight: '0.5rem',
                                marginBottom: '0.25rem'
                              }}>
                                <input
                                  type="text"
                                  autoFocus
                                  value={customInputText}
                                  onChange={e => setCustomInputText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      handleSubmitAntigravity();
                                    }
                                  }}
                                  placeholder="Tell the agent what to do instead..."
                                  style={{
                                    width: '100%',
                                    background: '#121214',
                                    border: '1px solid rgba(255, 255, 255, 0.22)',
                                    borderRadius: '8px',
                                    padding: '0.55rem 0.8rem',
                                    fontSize: '0.84rem',
                                    color: '#ffffff',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 4. Footer: Skip and Submit ↵ buttons */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '0.65rem',
                      marginTop: '0.5rem'
                    }}>
                      <button
                        type="button"
                        onClick={() => handleRemoteAction(pendingAlert.id, 'reject', 'Skip', 4)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          fontSize: '0.88rem',
                          fontWeight: 500,
                          padding: '0.45rem 0.85rem',
                          cursor: 'pointer',
                          borderRadius: '6px'
                        }}
                      >
                        Skip
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitAntigravity}
                        style={{
                          background: '#0071e3',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          padding: '0.5rem 1.25rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer',
                          boxShadow: '0 2px 12px rgba(0, 113, 227, 0.45)',
                          transition: 'transform 0.1s ease'
                        }}
                      >
                        <span>Submit</span>
                        <span style={{ fontSize: '1rem', lineHeight: '1' }}>↵</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // CASE 2: GitHub Copilot
              if (isCopilot) {
                return (
                  <div style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 20px 48px -10px rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.9rem',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '7px',
                        background: 'rgba(56, 139, 253, 0.15)',
                        border: '1px solid rgba(56, 139, 253, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#58a6ff'
                      }}>
                        <Terminal size={15} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '0.98rem', fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
                          GitHub Copilot
                        </h2>
                        <span style={{ fontSize: '0.74rem', color: '#8b949e' }}>
                          Command execution permission requested
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.86rem', color: '#c9d1d9', lineHeight: '1.4' }}>
                      {pendingAlert.description}
                    </p>

                    {pendingAlert.command && (
                      <div style={{
                        background: '#0d1117',
                        border: '1px solid #21262d',
                        borderRadius: '8px',
                        padding: '0.75rem 0.9rem'
                      }}>
                        <code style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '0.84rem',
                          color: '#79c0ff',
                          wordBreak: 'break-all',
                          display: 'block'
                        }}>
                          {pendingAlert.command}
                        </code>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem' }}>
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
                        <CheckCircle2 size={16} />
                        Allow (Run)
                      </button>

                      <button
                        onClick={() => handleRemoteAction(pendingAlert.id, 'reject', 'n')}
                        style={{
                          background: '#21262d',
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

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '8px',
                      padding: '0.35rem 0.45rem 0.35rem 0.85rem',
                      gap: '0.4rem'
                    }}>
                      <input
                        type="text"
                        value={customInputText}
                        onChange={e => setCustomInputText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customInputText.trim()) {
                            handleRemoteAction(pendingAlert.id, 'answer', customInputText.trim());
                            setCustomInputText('');
                          }
                        }}
                        placeholder="Reply to Copilot..."
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'transparent',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.84rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        disabled={!customInputText.trim()}
                        onClick={() => {
                          if (customInputText.trim()) {
                            handleRemoteAction(pendingAlert.id, 'answer', customInputText.trim());
                            setCustomInputText('');
                          }
                        }}
                        style={{
                          background: customInputText.trim() ? '#1f6feb' : 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.45rem 0.8rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: customInputText.trim() ? 'pointer' : 'default'
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                );
              }

              // CASE 3: Claude Code
              if (isClaude) {
                return (
                  <div style={{
                    background: '#1c1917',
                    border: '1px solid rgba(234, 88, 12, 0.3)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 20px 48px -10px rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.9rem',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '7px',
                        background: 'rgba(234, 88, 12, 0.15)',
                        border: '1px solid rgba(234, 88, 12, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f97316'
                      }}>
                        <Terminal size={15} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '0.98rem', fontWeight: 600, color: '#f5f5f4', margin: 0 }}>
                          Claude Code
                        </h2>
                        <span style={{ fontSize: '0.74rem', color: '#a8a29e' }}>
                          Terminal execution requested
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.86rem', color: '#e7e5e4', lineHeight: '1.4' }}>
                      {pendingAlert.description}
                    </p>

                    {pendingAlert.command && (
                      <div style={{
                        background: '#0c0a09',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '0.75rem 0.9rem'
                      }}>
                        <code style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '0.84rem',
                          color: '#fdba74',
                          wordBreak: 'break-all',
                          display: 'block'
                        }}>
                          {pendingAlert.command}
                        </code>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem' }}>
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
                        <CheckCircle2 size={16} />
                        Allow (y)
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

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#0c0a09',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.35rem 0.45rem 0.35rem 0.85rem',
                      gap: '0.4rem'
                    }}>
                      <input
                        type="text"
                        value={customInputText}
                        onChange={e => setCustomInputText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customInputText.trim()) {
                            handleRemoteAction(pendingAlert.id, 'answer', customInputText.trim());
                            setCustomInputText('');
                          }
                        }}
                        placeholder="Reply to Claude..."
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'transparent',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.84rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        disabled={!customInputText.trim()}
                        onClick={() => {
                          if (customInputText.trim()) {
                            handleRemoteAction(pendingAlert.id, 'answer', customInputText.trim());
                            setCustomInputText('');
                          }
                        }}
                        style={{
                          background: customInputText.trim() ? '#ea580c' : 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.45rem 0.8rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: customInputText.trim() ? 'pointer' : 'default'
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                );
              }

              // CASE 4: Generic Agent Fallback
              return (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.9rem',
                  textAlign: 'left'
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      Permission Required
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginTop: '0.25rem' }}>
                      {pendingAlert.description}
                    </p>
                  </div>

                  {pendingAlert.command && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '0.75rem 0.9rem'
                    }}>
                      <code style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.82rem',
                        color: '#38bdf8',
                        wordBreak: 'break-all',
                        display: 'block'
                      }}>
                        {pendingAlert.command}
                      </code>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.6rem' }}>
                    <button
                      onClick={() => handleRemoteAction(pendingAlert.id, 'approve')}
                      style={{
                        background: '#34c759',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer'
                      }}
                    >
                      <CheckCircle2 size={16} />
                      Approve (y)
                    </button>

                    <button
                      onClick={() => handleRemoteAction(pendingAlert.id, 'reject')}
                      style={{
                        background: 'rgba(255, 59, 48, 0.12)',
                        color: 'var(--accent-red)',
                        border: '1px solid rgba(255, 59, 48, 0.25)',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Reject (n)
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Auxiliary Controls Below Card */}
            <div style={{ display: 'flex', gap: '0.55rem', width: '100%', padding: '0 0.25rem' }}>
              <button
                onClick={() => handleRemoteAction(pendingAlert.id, 'focus')}
                title="Raise desktop editor to foreground"
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.8rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer'
                }}
              >
                <span>🪟 Bring IDE to Front</span>
                <ArrowUpRight size={13} style={{ opacity: 0.6 }} />
              </button>

              <button
                onClick={() => handleResolve(pendingAlert.id)}
                style={{
                  background: 'none',
                  color: 'var(--text-3)',
                  border: '1px solid transparent',
                  borderRadius: '10px',
                  padding: '0.55rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Silence Only
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '24px',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            position: 'relative'
          }}>
            {/* Minimalist Radar Beacon */}
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(52, 199, 89, 0.08)',
              border: '1.5px solid rgba(52, 199, 89, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div className="radar-ring" style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: '1px solid var(--accent-green)'
              }} />
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: 'var(--accent-green)',
                boxShadow: '0 0 12px var(--accent-green)'
              }} />
            </div>

            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Listening on "{room}"
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginTop: '0.35rem' }}>
                Your phone will siren when any AI agent asks for permission.
              </p>
            </div>
          </div>
        )}

        {/* 3. Room & Pairing (Single Clean Card) */}
        <section style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Room Channel
            </span>
            <button
              onClick={() => setShowQR(!showQR)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-2)',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer'
              }}
            >
              <QrCode size={14} /> {showQR ? 'Hide QR' : 'Pair Phone'}
            </button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '0.25rem 0.35rem 0.25rem 0.85rem',
            gap: '0.4rem',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <input 
              type="text"
              value={room}
              onChange={e => updateRoom(e.target.value)}
              placeholder="room-name"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 600,
                outline: 'none',
                padding: '0.4rem 0'
              }}
            />
            <button
              onClick={() => updateRoom(generateRandomKey())}
              title="Rotate / Generate New Key"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: '9px',
                width: '34px',
                height: '34px',
                flexShrink: 0,
                color: 'var(--text-2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={copyRoom}
              style={{
                background: isCopied ? 'rgba(52, 199, 89, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${isCopied ? 'rgba(52, 199, 89, 0.3)' : 'var(--border)'}`,
                borderRadius: '9px',
                height: '34px',
                padding: '0 0.85rem',
                flexShrink: 0,
                color: isCopied ? 'var(--accent-green)' : 'var(--text-1)',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {isCopied ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
              {isCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Simple 1-sentence prompt for VS Code */}
          <p style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginTop: '0.75rem', lineHeight: '1.4' }}>
            In VS Code or Antigravity, press <strong style={{ color: 'var(--text-2)' }}>Cmd+Shift+P</strong> &rarr; <strong style={{ color: 'var(--text-2)' }}>HeyHuman: Set Web Room ID</strong> &rarr; enter <code style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{room}</code>.
          </p>

          {/* QR Code Modal Overlay */}
          {showQR && (
            <div style={{
              marginTop: '1rem',
              padding: '1.25rem',
              background: '#ffffff',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              position: 'relative'
            }}>
              <button 
                onClick={() => setShowQR(false)}
                style={{
                  position: 'absolute',
                  top: '0.6rem',
                  right: '0.6rem',
                  background: 'none',
                  border: 'none',
                  color: '#000000',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
              <QRCodeSVG 
                value={roomUrl} 
                size={160}
                level="H"
                imageSettings={{
                  src: '/logo.svg',
                  x: undefined,
                  y: undefined,
                  height: 38,
                  width: 38,
                  excavate: true,
                }}
              />
              <span style={{ color: '#090a0f', fontSize: '0.75rem', fontWeight: 600 }}>
                Scan to open on your phone
              </span>
            </div>
          )}
        </section>

        {/* 4. Sound Tone Selector */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.5rem'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600 }}>Siren Tone</span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {(['siren', 'alarm', 'chime', 'beep'] as const).map(tone => (
              <button
                key={tone}
                onClick={() => {
                  setSoundType(tone);
                  if (isAudioUnlocked) audioAlertEngine.playSound(tone);
                }}
                style={{
                  background: soundType === tone ? 'rgba(255, 255, 255, 0.12)' : 'none',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: soundType === tone ? 700 : 500,
                  color: soundType === tone ? '#ffffff' : 'var(--text-3)',
                  textTransform: 'capitalize',
                  cursor: 'pointer'
                }}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Recent History (Only if alerts exist) */}
        {alerts.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', padding: '0 0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600 }}>Activity</span>
              <button 
                onClick={handleClear}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {alerts.slice(0, 5).map(item => (
                <div 
                  key={item.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: item.resolved ? 0.5 : 1
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{item.agent}</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.15rem' }}>
                      {item.description}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 6. Footer (Elegant, Simple Attribution) */}
      <footer style={{
        textAlign: 'center',
        paddingTop: '2rem',
        fontSize: '0.76rem',
        color: 'var(--text-3)'
      }}>
        Designed & Engineered by{' '}
        <a 
          href="https://portfolio.akdey.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            color: 'var(--text-2)',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem'
          }}
        >
          AMIT KUMAR DEY <ExternalLink size={11} />
        </a>
      </footer>
    </div>
  );
}

export default App;
