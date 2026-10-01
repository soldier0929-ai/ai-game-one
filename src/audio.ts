export type SoundKind = 'fire' | 'shot' | 'impact' | 'splash' | 'win' | 'lose' | 'click';
interface Voice { oscillator: OscillatorNode; envelope: GainNode }
interface Tone { frequency: number; end: number; duration: number; type: OscillatorType; volume: number; delay?: number }
const tones: Record<SoundKind, Tone[]> = {
  fire: [{ frequency: 160, end: 38, duration: 0.2, type: 'triangle', volume: 0.35 }],
  shot: [{ frequency: 160, end: 38, duration: 0.2, type: 'triangle', volume: 0.35 }],
  impact: [{ frequency: 110, end: 45, duration: 0.11, type: 'triangle', volume: 0.24 }],
  splash: [{ frequency: 360, end: 75, duration: 0.26, type: 'sine', volume: 0.16 }],
  click: [{ frequency: 640, end: 480, duration: 0.055, type: 'sine', volume: 0.09 }],
  win: [523, 659, 784].map((frequency, i) => ({ frequency, end: frequency, duration: 0.24, type: 'sine', volume: 0.14, delay: i * 0.11 })),
  lose: [{ frequency: 260, end: 130, duration: 0.32, type: 'sine', volume: 0.13 }],
};

/** No context is created until a user gesture calls unlock(). */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Set<Voice>();
  private muted = false;
  private unlocked = false;
  private suspended = false;
  private disposed = false;
  private unlocking: Promise<void> | null = null;
  private readonly maxVoices = 8;
  private lastImpact = -Infinity;
  private get constructorType(): typeof AudioContext | undefined {
    return globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  }

  async unlock(): Promise<void> {
    if (this.disposed || !this.constructorType) return;
    if (this.unlocking) return this.unlocking;
    this.unlocking = (async () => {
      try {
        if (!this.context) {
          this.context = new this.constructorType!(); this.master = this.context.createGain();
          this.master.gain.value = this.muted ? 0 : 0.6; this.master.connect(this.context.destination);
        }
        if (!this.suspended) await this.context.resume();
        if (!this.disposed) this.unlocked = true;
      } catch { this.unlocked = false; }
    })();
    try { await this.unlocking; } finally { this.unlocking = null; }
  }

  play(kind: SoundKind, strength = 1): void {
    const ctx = this.context;
    if (this.disposed || this.muted || this.suspended || !this.unlocked || !ctx || !this.master || ctx.state !== 'running') return;
    if (kind === 'impact') {
      if (ctx.currentTime - this.lastImpact < 0.06) return;
      this.lastImpact = ctx.currentTime;
    }
    const volume = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 1));
    for (const tone of tones[kind] ?? []) {
      if (this.voices.size >= this.maxVoices) break;
      try {
        const oscillator = ctx.createOscillator(); const envelope = ctx.createGain();
        const start = ctx.currentTime + (tone.delay ?? 0); const finish = start + tone.duration;
        oscillator.type = tone.type; oscillator.frequency.setValueAtTime(tone.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(tone.end, finish);
        envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
        envelope.gain.setValueAtTime(Math.max(0.0001, tone.volume * volume), start);
        envelope.gain.exponentialRampToValueAtTime(0.0001, finish);
        oscillator.connect(envelope); envelope.connect(this.master);
        const voice = { oscillator, envelope }; this.voices.add(voice);
        oscillator.onended = () => this.release(voice);
        oscillator.start(start); oscillator.stop(finish + 0.02);
      } catch { /* A device or closed audio context should never interrupt play. */ }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.6;
    if (muted) this.stopVoices();
  }

  async suspend(): Promise<void> {
    if (this.disposed) return;
    this.suspended = true; this.stopVoices();
    try { await this.context?.suspend(); } catch { /* Device may have disappeared. */ }
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    this.suspended = false;
    if (this.unlocked) { try { await this.context?.resume(); } catch { /* Remains silent until unlock retries. */ } }
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.oscillator.onended = null; voice.oscillator.disconnect(); voice.envelope.disconnect();
  }
  private stopVoices(): void {
    for (const voice of this.voices) {
      try { voice.oscillator.stop(); } catch { /* Already stopped. */ }
      this.release(voice);
    }
  }

  diagnostics() {
    return { supported: !!this.constructorType, unlocked: this.unlocked, muted: this.muted, suspended: this.suspended, activeVoices: this.voices.size, maxVoices: this.maxVoices, disposed: this.disposed };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.unlocked = false; this.stopVoices(); this.master?.disconnect();
    void this.context?.close().catch(() => {}); this.context = null; this.master = null;
  }
}
