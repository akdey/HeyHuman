import { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
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
  Shuffle
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

const RANDOM_ADJECTIVES = ['fast', 'clever', 'swift', 'hyper', 'crypto', 'silent', 'wild', 'super'];
const RANDOM_NOUNS = ['lynx', 'falcon', 'tiger', 'robot', 'badger', 'panther', 'viper', 'matrix'];

function generateRandomRoom(): string {
  const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
  const noun = RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${noun}-${num}`;
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialRoom = searchParams.get('room') || 'my-room';

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
        }, 800);
      }
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 500]);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`🚨 HeyHuman: ${item.agent}`, {
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

    setTimeout(() => setIsTesting(false), 1500);
  };

  const handleResolve = async (id: string) => {
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 }
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
    <div className={`min-h-screen flex flex-col ${isFlashing ? 'screen-flashing' : ''}`} style={{ paddingBottom: '3rem' }}>
      {/* Audio Unlock Notification Bar for Mobile Devices */}
      {!isAudioEnabled && (
        <div style={{
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          padding: '0.75rem 1rem',
          textAlign: 'center',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          fontWeight: 500,
          boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)'
        }}>
          <Smartphone size={18} />
          <span>Tap to activate audio sirens and speech synthesis on your phone!</span>
          <button 
            onClick={enableAudio}
            style={{
              background: '#ffffff',
              color: '#1d4ed8',
              border: 'none',
              borderRadius: '6px',
              padding: '0.25rem 0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Activate Sound
          </button>
        </div>
      )}

      {/* Main Header */}
      <header style={{
        padding: '1.25rem 1rem',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        maxWidth: '1000px',
        margin: '0 auto',
        width: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src="/logo.svg" alt="HeyHuman Logo" style={{ width: '40px', height: '40px' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>HeyHuman</h1>
              <span style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                WEB & PWA
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Phone siren & push alerts when your AI is blocked waiting for you
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              background: isAudioEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isAudioEnabled ? '#10b981' : '#ef4444',
              border: `1px solid ${isAudioEnabled ? '#10b981' : '#ef4444'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            {isAudioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {isAudioEnabled ? 'Sound Active' : 'Sound Muted'}
          </button>

          <button
            onClick={handleTestAlert}
            disabled={isTesting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.85rem',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
            }}
          >
            <ShieldAlert size={16} />
            Test Siren
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{
        maxWidth: '1000px',
        margin: '0 auto',
        width: '100%',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        {/* Multi-User Room Pairing Section */}
        <section style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem'
        }}>
          {/* Room Selection */}
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
              <Radio size={14} color="#06b6d4" />
              Your Multi-User Room ID
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text"
                value={room}
                onChange={e => handleRoomChange(e.target.value)}
                placeholder="e.g. akdey"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  flex: 1
                }}
              />
              <button
                onClick={handleRandomRoom}
                title="Generate random room"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8rem'
                }}
              >
                <Shuffle size={14} /> New
              </button>
              <button
                onClick={() => setShowQR(!showQR)}
                title="Scan QR Code to open on mobile"
                style={{
                  background: showQR ? '#06b6d4' : 'var(--bg-secondary)',
                  color: showQR ? '#000000' : 'var(--text-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                <QrCode size={16} /> QR
              </button>
            </div>

            {/* QR Code Popover */}
            {showQR && (
              <div style={{
                marginTop: '1rem',
                background: '#ffffff',
                padding: '1rem',
                borderRadius: '8px',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <QRCodeSVG value={roomUrl} size={160} />
                <span style={{ color: '#000000', fontSize: '0.75rem', fontWeight: 600 }}>
                  Scan with phone camera
                </span>
              </div>
            )}

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Only devices tuned to room <code style={{ color: '#06b6d4' }}>{room}</code> will receive alerts.
            </p>
          </div>

          {/* Sound Preferences & Quick Connect */}
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
              <Bell size={14} color="#f59e0b" />
              Siren Audio Tone & Voice
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {(['siren', 'alarm', 'chime', 'beep'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setSoundType(type);
                    if (isAudioEnabled) audioAlertEngine.playSound(type);
                  }}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    background: soundType === type ? '#ef4444' : 'var(--bg-secondary)',
                    color: soundType === type ? '#ffffff' : 'var(--text-muted)',
                    border: `1px solid ${soundType === type ? '#ef4444' : varCSS('--border')}`,
                    cursor: 'pointer'
                  }}
                >
                  {type}
                </button>
              ))}
              <button
                onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: isSpeechEnabled ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-secondary)',
                  color: isSpeechEnabled ? '#c084fc' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                🗣️ Voice {isSpeechEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Quick VS Code Config copy */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={copySettingSnippet}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.6rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {isSettingCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                Copy VS Code Setting: <code>"heyhuman.webRoom": "{room}"</code>
              </button>
            </div>
          </div>
        </section>

        {/* Live Pending Alert Siren Banner */}
        {activePendingCount > 0 && (
          <div 
            className="siren-active"
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.25))',
              border: '2px solid #ef4444',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                background: '#ef4444',
                color: '#ffffff',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ShieldAlert size={26} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f87171' }}>
                  AI IS WAITING FOR YOUR PERMISSION! ({activePendingCount})
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                  Check your terminal or IDE window to approve the action.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const pending = alerts.find(a => !a.resolved);
                if (pending) handleResolve(pending.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 1.4rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
              }}
            >
              <CheckCircle2 size={18} />
              Acknowledge & Silence
            </button>
          </div>
        )}

        {/* Incoming Alerts Feed */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Bot size={18} color="#8b5cf6" />
              Incoming Permission Alerts (Room: {room})
            </h2>
            {alerts.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={14} /> Clear History
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px dashed var(--border)',
              borderRadius: '12px',
              padding: '2.5rem 1rem',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              <Radio size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5, color: '#06b6d4' }} />
              <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>Listening for AI permissions in room "{room}"...</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Open this room on your phone, or tap "Test Siren" above to trigger a test alert.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {alerts.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: item.resolved ? 'var(--bg-secondary)' : 'var(--bg-card)',
                    border: `1px solid ${item.resolved ? 'var(--border)' : '#ef4444'}`,
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    opacity: item.resolved ? 0.7 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{
                      background: item.resolved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: item.resolved ? '#10b981' : '#ef4444',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {item.resolved ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.agent}</span>
                        {item.tool && (
                          <span style={{
                            fontSize: '0.7rem',
                            background: 'var(--bg-secondary)',
                            color: '#06b6d4',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            fontFamily: 'monospace'
                          }}>
                            {item.tool}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {!item.resolved && (
                    <button
                      onClick={() => handleResolve(item.id)}
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.75rem',
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

        {/* Integration Instructions */}
        <section style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.25rem'
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <Terminal size={16} color="#06b6d4" />
            Connect Your Agent, Hook, or CLI
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Trigger an alert for room <strong>{room}</strong> from any script:
          </p>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.75rem',
            position: 'relative',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#38bdf8',
            overflowX: 'auto'
          }}>
            <button
              onClick={copyWebhook}
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
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
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{webhookCurlExample}</pre>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        textAlign: 'center',
        padding: '1.5rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)'
      }}>
        HeyHuman · Open Source Multi-User AI Permission Siren · PWA Ready
      </footer>
    </div>
  );
}

function varCSS(name: string) {
  return `var(${name})`;
}

export default App;
