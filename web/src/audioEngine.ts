// Web Audio Engine for HeyHuman sirens, alarms, beeps, chimes, and Speech Synthesis

class WebAudioAlertEngine {
  private audioCtx: AudioContext | null = null;
  private isAudioUnlocked: boolean = false;
  private soundCache = new Map<string, AudioBuffer>();

  constructor() {
    // Lazy init audio context on first user touch / click
  }

  public unlockAudio(): boolean {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.isAudioUnlocked = true;

      // Play a silent 0.01s buffer to satisfy iOS Safari & Android Chrome autoplay restrictions
      const buffer = this.audioCtx.createBuffer(1, 1, 22050);
      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);
      source.start(0);

      return true;
    } catch {
      return false;
    }
  }

  public isUnlocked(): boolean {
    return this.isAudioUnlocked && this.audioCtx?.state === 'running';
  }

  public async playSound(soundType: 'siren' | 'alarm' | 'chime' | 'beep' = 'siren'): Promise<void> {
    this.unlockAudio();
    if (!this.audioCtx) return;

    try {
      // 1. Try to fetch and decode actual sound file from public/sounds
      let buffer = this.soundCache.get(soundType);
      if (!buffer) {
        const response = await fetch(`/sounds/${soundType}.wav`);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
          this.soundCache.set(soundType, buffer);
        }
      }

      if (buffer) {
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
        source.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        source.start(0);
        return;
      }
    } catch {
      // Fallback to pure synthesized Web Audio oscillators if audio files fail
      this.playSynthesizedTone(soundType);
    }
  }

  // Synthesized Web Audio fallback (works 100% offline without assets)
  public playSynthesizedTone(type: string): void {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === 'siren') {
      // Police / Emergency dual-tone siren
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(950, now + 0.3);
      osc.frequency.linearRampToValueAtTime(600, now + 0.6);
      osc.frequency.linearRampToValueAtTime(950, now + 0.9);
      osc.frequency.linearRampToValueAtTime(600, now + 1.2);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
      osc.start(now);
      osc.stop(now + 1.4);
    } else if (type === 'alarm') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0, now + 0.15);
      gain.gain.setValueAtTime(0.4, now + 0.25);
      gain.gain.setValueAtTime(0, now + 0.4);
      gain.gain.setValueAtTime(0.4, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (type === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else {
      // Beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  // Voice Speech: "Hey human! Claude Code needs your permission."
  public speak(text: string): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any existing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      // Pick best English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google')));
      if (preferred) utterance.voice = preferred;
      window.speechSynthesis.speak(utterance);
    }
  }
}

export const audioAlertEngine = new WebAudioAlertEngine();
