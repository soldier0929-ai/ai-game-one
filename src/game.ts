export type PlayPhase = 'aiming' | 'settling' | 'won' | 'lost';
export const victoryTarget = (total: number): number => Math.ceil(total * .8);
export const starsForAmmo = (ammo: number): number => Math.min(3, Math.max(0, ammo) + 1);

/** Pure game rules. Only real simulation observations enter step(). */
export class GameSession {
 readonly target: number;
 ammo: number;
 fallen = 0;
 phase: PlayPhase = 'aiming';
 elapsed = 0;
 paused = false;
 private quietTime = 0;
 constructor(readonly total: number, readonly maxAmmo: number) {
  this.target = victoryTarget(total); this.ammo = maxAmmo;
 }
 get stars(): number { return this.phase === 'won' ? starsForAmmo(this.ammo) : 0; }
 fire(): boolean {
  if (this.paused || this.phase !== 'aiming' || this.ammo <= 0) return false;
  this.ammo--; this.phase = 'settling'; this.elapsed = 0; this.quietTime = 0; return true;
 }
 step(dt: number, observedFallen: number, settled: boolean): void {
  if (this.paused || this.phase === 'won' || this.phase === 'lost') return;
  if (Number.isFinite(observedFallen)) this.fallen = Math.min(this.total, Math.max(this.fallen, Math.floor(observedFallen)));
  if (this.fallen >= this.target) { this.phase = 'won'; return; }
  if (this.phase !== 'settling' || !Number.isFinite(dt) || dt < 0) return;
  this.elapsed += dt; this.quietTime = settled ? this.quietTime + dt : 0;
  if (this.elapsed + 1e-9 >= 6 || this.quietTime + 1e-9 >= .6) this.phase = this.ammo > 0 ? 'aiming' : 'lost';
 }
 pause(): void { this.paused = true; }
 resume(): void { this.paused = false; }
}
