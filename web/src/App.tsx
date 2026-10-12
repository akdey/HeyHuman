import { useState, useEffect, useRef } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Radio, 
  ShieldAlert, 
  CheckCircle2, 
  Trash2, 
  Terminal, 
  Copy, 
  Check, 
  Smartphone,
  Bot,
  QrCode,
  Shuffle,
  Volume1,
  ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { audioAlertEngine } from './audioEngine';

interface AlertItem {
  id: string;
  agent: string;
  type: string;
  tool?: string;
  description?: string;
  timestamp: number;
  resolved?: boolean;
}

const RANDOM_ADJECTIVES = ['hyper', 'swift', 'zero', 'cyber', 'silent', 'delta', 'vivid', 'quantum'];
const RANDOM_NOUNS = ['lynx', 'falcon', 'matrix', 'beacon', 'badger', 'panther', 'nexus', 'pulse'];

function generateRandomRoom(): string {
  const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
  const noun = RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${noun}-${num}`;
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialRoom = searchParams.get('room') || 'my-workspace';

  const [room, setRoom] = useState<string>(initialRoom);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [soundType, setSoundType] = useState<'siren' | 'alarm' | 'chime' | 'beep'>('siren');
  const [isSpeechEnabled, setIsSpeechEnabled] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSettingCopied, setIsSettingCopied] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [activePendingCount, setActivePendingCount] = useState<number>(0);

  const lastSeenIdRef = useRef<string | null>(null);
  const pollerRef = useRef<number | null>(null);

  const roomUrl = `${window.location.origin}?room=${room}`;

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleRoomChange = (newRoom: string) => {
    const sanitized = newRoom.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setRoom(sanitized);
    const url = new URL(window.location.href);
    url.searchParams.set('room', sanitized);
    window.history.replaceState({}, '', url.toString());
  };

  const handleRandomRoom = () => {
    const r = generateRandomRoom();
    handleRoomChange(r);
  };

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/alert?room=${encodeURIComponent(room)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.alerts)) {
          const fetchedAlerts: AlertItem[] = data.alerts;
          setAlerts(fetchedAlerts);

          const pending = fetchedAlerts.filter(a => !a.resolved);
          setActivePendingCount(pending.length);

          if (pending.length > 0) {
            const newest = pending[0];
            if (newest.id !== lastSeenIdRef.current) {
              lastSeenIdRef.current = newest.id;
              triggerAlertSequence(newest);
            }
          } else {
            setIsFlashing(false);
          }
        }
      } catch {
        // Silently retry
      }
    };

    fetchAlerts();
    pollerRef.current = window.setInterval(fetchAlerts, 2000);

    return () => {
      if (pollerRef.current) window.clearInterval(pollerRef.current);
    };
  }, [room, isAudioEnabled, isSpeechEnabled, soundType]);

  const triggerAlertSequence = (item: AlertItem) => {
    setIsFlashing(true);

    if (isAudioEnabled) {
      audioAlertEngine.playSound(soundType);
      if (isSpeechEnabled) {
        setTimeout(() => {
          audioAlertEngine.speak(`Hey human! ${item.agent} is asking for your permission!`);
        }, 850);
      }
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 500]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`HeyHuman · ${item.agent}`, {
          body: item.description || `Approval required: ${item.tool || 'Action'}`,
          icon: '/logo.png',
          tag: item.id
        });
      } catch {
        // Ignored
      }
    }
  };

  const enableAudio = () => {
    const success = audioAlertEngine.unlockAudio();
    if (success) {
      setIsAudioEnabled(true);
      audioAlertEngine.playSound('chime');
    }
  };

  const handleTestAlert = async () => {
    enableAudio();
    setIsTesting(true);

    const testItem: AlertItem = {
      id: `test_${Date.now()}`,
      agent: 'Antigravity / Claude Code',
      type: 'Permission Request',
      tool: 'Terminal Command',
      description: 'npm run deploy:production requires user confirmation',
      timestamp: Date.now(),
      resolved: false
    };

    triggerAlertSequence(testItem);

    try {
      await fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testItem)
      });
    } catch {
      setAlerts(prev => [testItem, ...prev]);
    }

    setTimeout(() => setIsTesting(false), 1400);
  };

  const handleResolve = async (id: string) => {
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.65 },
      colors: ['#f43f5e', '#3b82f6', '#10b981', '#ffffff']
    });

    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    setIsFlashing(false);

    try {
      await fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', id })
      });
    } catch {
      // Ignore
    }
  };

  const handleClearAll = async () => {
    setAlerts([]);
    setIsFlashing(false);
    lastSeenIdRef.current = null;
    try {
      await fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
    } catch {
      // Ignore
    }
  };

  const webhookCurlExample = `curl -X POST "${window.location.origin}/api/alert?room=${room}" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"Claude Code","tool":"Terminal","description":"Permission needed"}'`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookCurlExample);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copySettingSnippet = () => {
    navigator.clipboard.writeText(`"heyhuman.webRoom": "${room}"`);
    setIsSettingCopied(true);
    setTimeout(() => setIsSettingCopied(false), 2000);
  };

  return (
    <div className={`min-h-screen flex flex-col ${isFlashing ? 'screen-flashing' : ''}`} style={{ paddingBottom: '3.5rem' }}>
      
      {/* Mobile Audio Activation Bar */}
      {!isAudioEnabled && (
        <div style={{
          backgroundColor: '#1d283a',
          borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#e2e8f0',
          padding: '0.65rem 1rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.85rem',
          fontWeight: 500
        }}>
          <Smartphone size={16} color="#60a5fa" />
          <span>Tap to unlock audio sirens and voice speech on this device</span>
          <button 
            onClick={enableAudio}
            className="interactive-hover"
            style={{
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.3rem 0.85rem',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Enable Sound
          </button>
        </div>
      )}

      {/* Main App Navigation */}
      <header style={{
        padding: '1.1rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'rgba(13, 17, 26, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1020px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.15), rgba(59, 130, 246, 0.15))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <img src="/logo.svg" alt="HeyHuman Logo" style={{ width: '26px', height: '26px' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff' }}>HeyHuman</span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  background: 'rgba(244, 63, 94, 0.12)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '6px'
                }}>
                  RELAY
                </span>
              </div>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
                Audible siren when your autonomous AI agent needs your approval
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setIsAudioEnabled(!isAudioEnabled)}
              className="interactive-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.8rem',
                background: isAudioEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                color: isAudioEnabled ? '#10b981' : '#f43f5e',
                border: `1px solid ${isAudioEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              {isAudioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {isAudioEnabled ? 'Audio Live' : 'Muted'}
            </button>

            <button
              onClick={handleTestAlert}
              disabled={isTesting}
              className="interactive-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.95rem',
                background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(244, 63, 94, 0.3)'
              }}
            >
              <ShieldAlert size={15} />
              Test Siren
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{
        maxWidth: '1020px',
        margin: '0 auto',
        width: '100%',
        padding: '1.5rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        
        {/* Active Alert Banner (When an AI tool is waiting) */}
        {activePendingCount > 0 && (
          <div 
            className="siren-active"
            style={{
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.18), rgba(15, 23, 42, 0.8))',
              backdropFilter: 'blur(16px)',
              border: '1px solid #f43f5e',
              borderRadius: '14px',
              padding: '1.35rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.25rem',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                background: '#f43f5e',
                color: '#ffffff',
                borderRadius: '12px',
                width: '46px',
                height: '46px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 0 24px rgba(244, 63, 94, 0.6)'
              }}>
                <ShieldAlert size={26} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                    APPROVAL REQUIRED ({activePendingCount})
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                  Your autonomous agent is suspended waiting for permission in your editor/terminal.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const pending = alerts.find(a => !a.resolved);
                if (pending) handleResolve(pending.id);
              }}
              className="interactive-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.7rem 1.4rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
              }}
            >
              <CheckCircle2 size={18} />
              Acknowledge & Silence
            </button>
          </div>
        )}

        {/* Workspace Tuning & Controls */}
        <section className="glass-panel" style={{
          borderRadius: '14px',
          padding: '1.35rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '1.5rem'
        }}>
          {/* Room Configuration */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Radio size={13} color="#06b6d4" />
                Alert Room Channel
              </label>
              <span style={{ fontSize: '0.7rem', color: '#06b6d4', fontWeight: 600 }}>Multi-User Isolated</span>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input 
                type="text"
                value={room}
                onChange={e => handleRoomChange(e.target.value)}
                placeholder="e.g. akdey"
                className="mono"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  padding: '0.55rem 0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  flex: 1,
                  outline: 'none'
                }}
              />
              <button
                onClick={handleRandomRoom}
                title="Generate new unique room"
                className="interactive-hover"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                <Shuffle size={13} /> New
              </button>
              <button
                onClick={() => setShowQR(!showQR)}
                title="Scan QR Code to pair mobile phone"
                className="interactive-hover"
                style={{
                  background: showQR ? '#06b6d4' : 'var(--bg-secondary)',
                  color: showQR ? '#000000' : 'var(--text-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0 0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}
              >
                <QrCode size={15} /> QR
              </button>
            </div>

            {/* QR Code Card */}
            {showQR && (
              <div style={{
                marginTop: '1rem',
                background: '#ffffff',
                padding: '1.25rem',
                borderRadius: '10px',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}>
                <QRCodeSVG value={roomUrl} size={150} />
                <span style={{ color: '#0f172a', fontSize: '0.75rem', fontWeight: 700 }}>
                  Scan with mobile camera to open room
                </span>
              </div>
            )}

            <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.45rem' }}>
              Only devices tuned to room <code className="mono" style={{ color: '#06b6d4' }}>{room}</code> receive this broadcast.
            </p>
          </div>

          {/* Sound Profile & Sync */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Volume1 size={14} color="#f59e0b" />
                Acoustic Siren Profile
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {(['siren', 'alarm', 'chime', 'beep'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setSoundType(type);
                    if (isAudioEnabled) audioAlertEngine.playSound(type);
                  }}
                  className="interactive-hover"
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '7px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    background: soundType === type ? '#f43f5e' : 'var(--bg-secondary)',
                    color: soundType === type ? '#ffffff' : 'var(--text-muted)',
                    border: `1px solid ${soundType === type ? '#f43f5e' : 'var(--border)'}`,
                    cursor: 'pointer'
                  }}
                >
                  {type}
                </button>
              ))}
              <button
                onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                className="interactive-hover"
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '7px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: isSpeechEnabled ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                  color: isSpeechEnabled ? '#60a5fa' : 'var(--text-muted)',
                  border: `1px solid ${isSpeechEnabled ? 'rgba(59, 130, 246, 0.4)' : 'var(--border)'}`,
                  cursor: 'pointer'
                }}
              >
                Voice Speech {isSpeechEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Extension Sync Hook */}
            <button
              onClick={copySettingSnippet}
              className="interactive-hover"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.75rem',
                background: 'var(--bg-secondary)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                borderRadius: '7px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              {isSettingCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>Copy Extension Setting: <code className="mono" style={{ color: '#06b6d4' }}>"heyhuman.webRoom": "{room}"</code></span>
            </button>
          </div>
        </section>

        {/* Incoming Alerts Feed */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Bot size={17} color="#06b6d4" />
              Live Permission Feed
            </h2>
            {alerts.length > 0 && (
              <button
                onClick={handleClearAll}
                className="interactive-hover"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-subtle)',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} /> Clear Feed
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="glass-panel" style={{
              borderRadius: '14px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              border: '1px dashed var(--border)'
            }}>
              <Radio size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4, color: '#06b6d4' }} />
              <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                Listening on room <span className="mono" style={{ color: '#06b6d4' }}>{room}</span>
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '0.3rem', maxWidth: '420px', margin: '0.3rem auto 0 auto' }}>
                Keep this tab open on your phone or tablet while away from your desk. You will hear an audible siren the moment your AI pauses for approval.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {alerts.map(item => (
                <div
                  key={item.id}
                  className="glass-panel interactive-hover"
                  style={{
                    borderRadius: '12px',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    border: `1px solid ${item.resolved ? 'var(--border)' : '#f43f5e'}`,
                    opacity: item.resolved ? 0.65 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                    <div style={{
                      background: item.resolved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.15)',
                      color: item.resolved ? '#10b981' : '#f43f5e',
                      borderRadius: '10px',
                      padding: '0.55rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {item.resolved ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>{item.agent}</span>
                        {item.tool && (
                          <span className="mono" style={{
                            fontSize: '0.7rem',
                            background: 'var(--bg-secondary)',
                            color: '#38bdf8',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '5px',
                            border: '1px solid var(--border)'
                          }}>
                            {item.tool}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {!item.resolved && (
                    <button
                      onClick={() => handleResolve(item.id)}
                      className="interactive-hover"
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '7px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Integration Snippet */}
        <section className="glass-panel" style={{
          borderRadius: '14px',
          padding: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ffffff' }}>
              <Terminal size={15} color="#06b6d4" />
              Direct Webhook Hook (Claude Code / Aider / Cursor / Shell)
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>HTTP POST</span>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '9px',
            padding: '0.85rem 1rem',
            position: 'relative',
            fontSize: '0.76rem',
            color: '#38bdf8',
            overflowX: 'auto'
          }}>
            <button
              onClick={copyWebhook}
              className="interactive-hover"
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.25rem 0.55rem',
                color: 'var(--text-main)',
                fontSize: '0.7rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              {isCopied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              {isCopied ? 'Copied' : 'Copy'}
            </button>
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{webhookCurlExample}</pre>
          </div>
        </section>
      </main>

      {/* Footer with Attribution */}
      <footer style={{
        marginTop: 'auto',
        textAlign: 'center',
        padding: '2rem 1.25rem 1.5rem 1.25rem',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.4rem'
      }}>
        <div style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          <span>Designed & Engineered by</span>
          <a 
            href="https://portfolio.akdey.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              color: '#ffffff',
              fontWeight: 700,
              textDecoration: 'none',
              borderBottom: '1px dotted #38bdf8',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            AMIT KUMAR DEY
            <ExternalLink size={12} color="#38bdf8" />
          </a>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
          HeyHuman · Open Source AI Permission Siren & Mobile Alert System
        </p>
      </footer>
    </div>
  );
}

export default App;
