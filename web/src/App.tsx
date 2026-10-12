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
  X,
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

const STORAGE_KEY = 'heyhuman_room';

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

  const lastSeenIdRef = useRef<string | null>(null);
  const pollerRef = useRef<number | null>(null);

  const roomUrl = `${window.location.origin}?room=${room}`;

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

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
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
      agent: 'AI Agent',
      type: 'Permission Request',
      tool: 'Terminal',
      description: 'Test permission alert is working properly',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Audio State Pill */}
          <button
            onClick={isAudioUnlocked ? () => setIsAudioUnlocked(false) : handleUnlockAudio}
            style={{
              background: isAudioUnlocked ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${isAudioUnlocked ? 'rgba(52, 199, 89, 0.3)' : 'var(--border)'}`,
              color: isAudioUnlocked ? 'var(--accent-green)' : 'var(--text-2)',
              borderRadius: '999px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer'
            }}
          >
            {isAudioUnlocked ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {isAudioUnlocked ? 'Sound On' : 'Tap for Sound'}
          </button>

          <button
            onClick={handleTestAlert}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              borderRadius: '999px',
              padding: '0.35rem 0.8rem',
              fontSize: '0.78rem',
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
          <div 
            className="alarm-active"
            style={{
              background: 'linear-gradient(180deg, rgba(255, 59, 48, 0.15) 0%, rgba(18, 20, 28, 0.8) 100%)',
              border: '1.5px solid var(--accent-red)',
              borderRadius: '24px',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.25rem'
            }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--accent-red)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(255, 59, 48, 0.6)'
            }}>
              <ShieldAlert size={34} />
            </div>

            <div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--accent-red)',
                textTransform: 'uppercase'
              }}>
                {pendingAlert.agent}
              </span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem', letterSpacing: '-0.02em' }}>
                Approval Required
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                {pendingAlert.description}
              </p>
            </div>

            <button
              onClick={() => handleResolve(pendingAlert.id)}
              style={{
                background: 'var(--accent-green)',
                color: '#000000',
                border: 'none',
                borderRadius: '14px',
                padding: '0.85rem 2rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(52, 199, 89, 0.4)'
              }}
            >
              <CheckCircle2 size={18} />
              Silence & Done
            </button>
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

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text"
              value={room}
              onChange={e => updateRoom(e.target.value)}
              placeholder="room-name"
              style={{
                flex: 1,
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '0.65rem 0.9rem',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 600,
                outline: 'none'
              }}
            />
            <button
              onClick={copyRoom}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '0 1rem',
                color: 'var(--text-1)',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer'
              }}
            >
              {isCopied ? <Check size={14} color="var(--accent-green)" /> : <Copy size={14} />}
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
