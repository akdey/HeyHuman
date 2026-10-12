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
  timestamp: number;
  resolved?: boolean;
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

      // Unsubscribe existing if needed or get active
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
      }

      // Send subscription to server
      const sendRes = await fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe_push',
          subscription: sub
        })
      });

      if (sendRes.ok) {
        setIsPushSubscribed(true);
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

  const handleRemoteAction = (id: string, action: 'approve' | 'reject' | 'focus') => {
    if (action === 'approve') {
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#34c759', '#0071e3', '#ffffff']
      });
    }

    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));

    fetch(`/api/alert?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action })
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
          <div 
            className="alarm-active"
            style={{
              background: 'radial-gradient(120% 120% at 50% 0%, rgba(255, 59, 48, 0.18) 0%, rgba(18, 20, 28, 0.95) 70%)',
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              border: '1px solid rgba(255, 59, 48, 0.5)',
              borderRadius: '26px',
              padding: '1.75rem 1.4rem',
              boxShadow: '0 20px 48px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 59, 48, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.25rem',
              width: '100%',
              maxWidth: '460px',
              margin: '0 auto'
            }}
          >
            {/* Top Badges & Agent Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'rgba(255, 59, 48, 0.16)',
                border: '1px solid rgba(255, 59, 48, 0.3)',
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                color: 'var(--accent-red)',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                <ShieldAlert size={14} />
                <span>{pendingAlert.agent}</span>
              </div>

              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 500 }}>
                {new Date(pendingAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Core Header Text */}
            <div style={{ textAlign: 'center', width: '100%' }}>
              <h2 style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                color: 'var(--text-1)',
                lineHeight: '1.2'
              }}>
                Permission Required
              </h2>
              <p style={{
                fontSize: '0.86rem',
                color: 'var(--text-2)',
                marginTop: '0.4rem',
                lineHeight: '1.4',
                fontWeight: 400
              }}>
                {pendingAlert.description}
              </p>
            </div>

            {/* Code / Command Inspection Terminal Block */}
            {pendingAlert.command && (
              <div style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.8rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-3)',
                  fontSize: '0.7rem',
                  fontWeight: 600
                }}>
                  <Terminal size={12} />
                  <span>Action / Command</span>
                </div>
                <div style={{ padding: '0.75rem 0.85rem', textAlign: 'left' }}>
                  <code style={{
                    fontSize: '0.8rem',
                    color: '#38bdf8',
                    fontFamily: 'var(--font-mono)',
                    wordBreak: 'break-all',
                    display: 'block',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    lineHeight: '1.45'
                  }}>
                    {pendingAlert.command}
                  </code>
                </div>
              </div>
            )}

            {/* Primary Action Buttons (Apple Segmented Style) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.55rem', width: '100%' }}>
                {/* Approve Primary Button */}
                <button
                  onClick={() => handleRemoteAction(pendingAlert.id, 'approve')}
                  style={{
                    background: '#34c759',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '0.85rem 1rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(52, 199, 89, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CheckCircle2 size={17} />
                  Approve (y)
                </button>

                {/* Reject Button */}
                <button
                  onClick={() => handleRemoteAction(pendingAlert.id, 'reject')}
                  style={{
                    background: 'rgba(255, 59, 48, 0.12)',
                    color: 'var(--accent-red)',
                    border: '1px solid rgba(255, 59, 48, 0.25)',
                    borderRadius: '14px',
                    padding: '0.85rem 1rem',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Reject (n)
                </button>
              </div>

              {/* Auxiliary Controls */}
              <div style={{ display: 'flex', gap: '0.55rem', width: '100%' }}>
                <button
                  onClick={() => handleRemoteAction(pendingAlert.id, 'focus')}
                  title="Raise desktop editor to foreground"
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: 'var(--text-1)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '0.65rem 0.8rem',
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
                    borderRadius: '12px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Silence Only
                </button>
              </div>
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
