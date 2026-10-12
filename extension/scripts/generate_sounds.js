const fs = require('fs');
const path = require('path');

function createWavBuffer(sampleRate, durationSeconds, generateSample) {
  const numChannels = 1; // mono
  const bytesPerSample = 2; // 16-bit
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // BlockAlign
  buffer.writeUInt16LE(bytesPerSample * 8, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, generateSample(t, i, totalSamples)));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

const soundsDir = path.join(__dirname, '..', 'media', 'sounds');
fs.mkdirSync(soundsDir, { recursive: true });

const SAMPLE_RATE = 44100;

// 1. Siren: 2-second dual-frequency oscillating siren (880Hz to 1320Hz warble, 2 cycles)
const sirenBuffer = createWavBuffer(SAMPLE_RATE, 2.0, (t) => {
  // 3 Hz LFO
  const lfo = Math.sin(2 * Math.PI * 3.0 * t);
  const freq = 900 + 350 * lfo;
  // Fade in / out smoothly
  const envelope = Math.min(1, t / 0.05) * Math.min(1, (2.0 - t) / 0.1);
  return Math.sin(2 * Math.PI * freq * t) * 0.7 * envelope;
});
fs.writeFileSync(path.join(soundsDir, 'siren.wav'), sirenBuffer);
console.log('Generated siren.wav');

// 2. Alarm: 3 rapid pulse bursts (960Hz)
const alarmBuffer = createWavBuffer(SAMPLE_RATE, 1.5, (t) => {
  const pulseIndex = Math.floor(t / 0.35);
  const pulseTime = t % 0.35;
  if (pulseIndex < 4 && pulseTime < 0.22) {
    const env = Math.sin(Math.PI * (pulseTime / 0.22));
    const tone = Math.sin(2 * Math.PI * 980 * t) + 0.3 * Math.sin(2 * Math.PI * 1960 * t);
    return tone * 0.5 * env;
  }
  return 0;
});
fs.writeFileSync(path.join(soundsDir, 'alarm.wav'), alarmBuffer);
console.log('Generated alarm.wav');

// 3. Chime: gentle ascending 3-note chime (523Hz C5, 659Hz E5, 784Hz G5)
const chimeBuffer = createWavBuffer(SAMPLE_RATE, 1.2, (t) => {
  let noteT = 0;
  let freq = 523.25;
  if (t < 0.3) {
    noteT = t;
    freq = 523.25; // C5
  } else if (t < 0.6) {
    noteT = t - 0.3;
    freq = 659.25; // E5
  } else {
    noteT = t - 0.6;
    freq = 783.99; // G5
  }
  const decay = Math.exp(-noteT * 7);
  return Math.sin(2 * Math.PI * freq * t) * decay * 0.6;
});
fs.writeFileSync(path.join(soundsDir, 'chime.wav'), chimeBuffer);
console.log('Generated chime.wav');

// 4. Beep: crisp double-beep
const beepBuffer = createWavBuffer(SAMPLE_RATE, 0.6, (t) => {
  const beepTime = t % 0.25;
  if (t < 0.5 && beepTime < 0.12) {
    const env = Math.sin(Math.PI * (beepTime / 0.12));
    return Math.sin(2 * Math.PI * 1200 * t) * 0.6 * env;
  }
  return 0;
});
fs.writeFileSync(path.join(soundsDir, 'beep.wav'), beepBuffer);
console.log('Generated beep.wav');
