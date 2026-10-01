export interface Progress { version: 1; unlocked: number; stars: number[]; muted: boolean }
const KEY = 'tidal-tower:v1';
const defaults = (): Progress => ({ version: 1, unlocked: 1, stars: Array(8).fill(0), muted: false });
function valid(value: unknown): value is Progress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return Object.keys(p).length === 4 && p.version === 1 && Number.isInteger(p.unlocked) && (p.unlocked as number) >= 1 && (p.unlocked as number) <= 8 &&
    Array.isArray(p.stars) && p.stars.length === 8 && p.stars.every(star => Number.isInteger(star) && star >= 0 && star <= 3) && typeof p.muted === 'boolean';
}
/** Validated durable progress with a session-only fallback if browser storage fails. */
export class ProgressStore {
  private storage: Storage | null;
  private progress: Progress = defaults();
  private failed = false;
  constructor(storage?: Storage | null) {
    if (storage === undefined) {
      try { this.storage = globalThis.localStorage ?? null; } catch { this.storage = null; }
    } else this.storage = storage;
    if (!this.storage) { this.failed = true; return; }
    let raw: string | null;
    try { raw = this.storage.getItem(KEY); } catch { this.storage = null; this.failed = true; return; }
    if (raw === null) return;
    try { const value: unknown = JSON.parse(raw); if (valid(value)) this.progress = { ...value, stars: [...value.stars] }; } catch { /* Corrupt data starts fresh. */ }
  }
  get unavailable(): boolean { return this.failed; }
  read(): Progress { return { ...this.progress, stars: [...this.progress.stars] }; }
  completeLevel(id: number, stars: number): Progress {
    if (!Number.isInteger(id) || id < 1 || id > 8 || !Number.isInteger(stars) || stars < 1 || stars > 3) return this.read();
    this.progress.stars[id - 1] = Math.max(this.progress.stars[id - 1], stars);
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(8, id + 1));
    this.persist(); return this.read();
  }
  setMuted(muted: boolean): Progress { this.progress.muted = muted; this.persist(); return this.read(); }
  private persist(): void {
    if (!this.storage) return;
    try { this.storage.setItem(KEY, JSON.stringify(this.progress)); }
    catch { this.storage = null; this.failed = true; }
  }
}
