import { useCallback, useRef } from "react";

export type SoundType = "move" | "capture" | "promote" | "win" | "lose";

const SOUND_PREF_KEY = "shashki_sound_enabled";

function soundEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(SOUND_PREF_KEY);
    // Default ON. Disabled only if user explicitly turned it off.
    return v !== "0";
  } catch {
    return true;
  }
}

function playMoveSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
  gain.gain.setValueAtTime(0.28, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc.start(now);
  osc.stop(now + 0.15);
}

function playCaptureSound(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Noise burst — shatter effect
  const bufferSize = Math.floor(ctx.sampleRate * 0.18);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.exp(-t * 8);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);

  // Add a pitch drop for extra punch
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
  oscGain.gain.setValueAtTime(0.2, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.start(now);
  osc.stop(now + 0.14);
}

function playPromoteSound(ctx: AudioContext) {
  // Royal bell chord ascending
  const freqs = [523, 659, 784, 1047];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.07;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.start(t);
    osc.stop(t + 0.7);
  });
}

function playWinSound(ctx: AudioContext) {
  const freqs = [392, 523, 659, 784, 1047];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.11;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.start(t);
    osc.stop(t + 0.42);
  });
}

function playLoseSound(ctx: AudioContext) {
  const freqs = [392, 330, 277, 220];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.16;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume().catch(() => null);
      }
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (type: SoundType) => {
      if (!soundEnabled()) return; // honor user mute toggle (home-sound-btn)
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        switch (type) {
          case "move":
            playMoveSound(ctx);
            break;
          case "capture":
            playCaptureSound(ctx);
            break;
          case "promote":
            playPromoteSound(ctx);
            break;
          case "win":
            playWinSound(ctx);
            break;
          case "lose":
            playLoseSound(ctx);
            break;
        }
      } catch {
        // Ignore audio errors silently
      }
    },
    [ensureContext],
  );

  return { play };
}
