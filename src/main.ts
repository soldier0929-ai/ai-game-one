import './style.css';
import { GameSession } from './game';
import { LEVELS } from './levels';
import { Simulation, initializePhysics } from './simulation';
import { clampAim } from './trajectory';
import { GameRenderer } from './renderer';
import { GameUI } from './ui';
import { GameAudio } from './audio';
import { AimInput } from './input';
import { ProgressStore } from './storage';
import { registerGameTools } from './webmcp';
import type { Aim, GameViewModel, PhysicsSnapshot, Screen, UIAction } from './types';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const uiRoot = document.querySelector<HTMLElement>('#ui')!;
const store = new ProgressStore();
const audio = new GameAudio();
let screen: Screen = 'loading';
let level = LEVELS[0];
let session = new GameSession(level.blocks.length, level.ammo);
let aim: Aim = { ...level.defaultAim };
let simulation: Simulation | null = null;
let renderer: GameRenderer | null = null;
let snapshot: PhysicsSnapshot = { blocks: [], projectile: null, fallenIds: [], bodyCount: 0, settled: true };
let previousSnapshot: PhysicsSnapshot = snapshot;
let dragging = false;
let error = '';
let accumulator = 0;
let previousTime = 0;
let celebration = 0;
let frame = 0;
let disposed = false;
let tutorialSeen = false;
let tutorialReturn: Screen = 'playing';
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
audio.setMuted(store.read().muted);

const ui = new GameUI(uiRoot, action => { void audio.unlock(); onAction(action); });
const canAim = () => screen === 'playing' && session.phase === 'aiming' && !session.paused;
const input = new AimInput(canvas, {
 getAim: () => aim,
 setAim: next => { if (canAim()) aim = clampAim(next); },
 canAim,
 fire,
 onPause: () => { if (screen === 'paused') resume(); else if (screen === 'playing') pause(); },
 onGesture: () => { void audio.unlock(); },
 onDragging: active => { dragging = active; renderUI(); },
});

function model(): GameViewModel {
 const p = store.read();
 return { screen, phase: session.phase === 'settling' ? 'settling' : 'aiming', currentLevel: level.id,
  levelName: level.title, levelHint: level.hint, ammo: session.ammo, maxAmmo: level.ammo,
  fallen: session.fallen, total: session.total, target: session.target, stars: session.stars,
  bestStars: p.stars, unlocked: p.unlocked, muted: p.muted, storageWarning: store.unavailable,
  settlingSeconds: Math.max(0, 6 - session.elapsed), error, dragging };
}
function renderUI(): void { canvas.style.touchAction = screen === 'playing' ? 'none' : 'auto'; ui.render(model()); }
function fail(reason: unknown): void {
 input.cancel(); session.pause(); audio.suspend(); screen = 'error';
 const message = reason instanceof Error ? reason.message : String(reason);
 error = /[\u3400-\u9fff]/.test(message) ? message : /webgl|context/i.test(message)
  ? '无法启动 3D 画面，请开启浏览器图形加速或使用新版浏览器，然后重试。'
  : '游戏暂时无法继续，请重新加载后再试。';
 renderUI();
}
function loadLevel(id: number): void {
 const selected = LEVELS.find(l => l.id === id);
 if (!selected) throw new Error('没有找到这一关，请重新选择。');
 input.cancel(); simulation?.dispose(); simulation = null;
 level = selected; session = new GameSession(level.blocks.length, level.ammo); aim = { ...level.defaultAim };
 simulation = new Simulation(level);
 // Settle the initial stack before input becomes available. No shot and no scoring occurs here.
 for (let i = 0; i < 120; i++) simulation.step(1 / 60);
 snapshot = simulation.snapshot(); previousSnapshot = snapshot; renderer?.setLevel(level);
 accumulator = 0; celebration = 0;
}
function startLevel(id: number): void {
 if (id < 1 || id > store.read().unlocked || id > LEVELS.length) return;
 try {
  loadLevel(id); screen = 'playing'; audio.resume();
  if (id === 1 && !tutorialSeen && store.read().stars[0] === 0) {
   tutorialReturn = 'playing'; screen = 'tutorial'; session.pause();
  }
  renderUI();
 } catch (e) { fail(e); }
}
function fire(): boolean {
 if (!canAim() || !simulation) return false;
 if (!simulation.fire(aim)) return false;
 session.fire(); dragging = false; renderer?.fireFeedback(); audio.play('fire'); renderUI(); return true;
}
function pause(): void {
 if (screen !== 'playing') return;
 input.cancel(); session.pause(); screen = 'paused'; accumulator = 0; audio.suspend(); renderUI();
}
function resume(): void {
 if (screen !== 'paused') return;
 screen = 'playing'; session.resume(); accumulator = 0; audio.resume(); renderUI();
}
function onAction(action: UIAction): void {
 if (screen === 'loading' && action.type !== 'mute') return;
 switch (action.type) {
  case 'start': startLevel(store.read().unlocked); break;
  case 'level': startLevel(action.id); break;
  case 'restart': startLevel(level.id); break;
  case 'next': startLevel(level.id + 1); break;
  case 'pause': pause(); break;
  case 'resume': resume(); break;
  case 'levels': input.cancel(); session.pause(); screen = 'levels'; audio.suspend(); renderUI(); break;
  case 'back':
   try { loadLevel(1); screen = 'home'; renderUI(); } catch (e) { fail(e); }
   break;
  case 'help':
   tutorialReturn = screen;
   input.cancel(); session.pause(); screen = 'tutorial'; audio.suspend(); renderUI(); break;
  case 'tutorial-done':
   tutorialSeen = true; screen = tutorialReturn;
   if (screen === 'playing') { session.resume(); audio.resume(); }
   renderUI(); break;
  case 'mute': { const p = store.setMuted(!store.read().muted); audio.setMuted(p.muted); renderUI(); break; }
  case 'retry': window.location.reload(); break;
 }
}
function finish(): void {
 if (session.phase === 'won' && screen === 'playing') {
  store.completeLevel(level.id, session.stars); screen = 'won'; celebration = 2.5; input.cancel(); audio.play('win');
 } else if (session.phase === 'lost' && screen === 'playing') {
  screen = 'lost'; input.cancel(); audio.play('lose');
 }
}
function tick(time: number): void {
 if (disposed) return;
 const dt = previousTime ? Math.min(.1, Math.max(0, (time - previousTime) / 1000)) : 0;
 previousTime = time;
 try {
  if (simulation && (screen === 'playing' || (screen === 'won' && celebration > 0))) {
   accumulator += dt; let steps = 0;
   while (accumulator >= 1 / 60 && steps++ < 5) {
    previousSnapshot = snapshot;
    const events = simulation.step(1 / 60);
    for (const event of events) { renderer?.impactFeedback(event); audio.play(event.type, event.strength); }
    snapshot = simulation.snapshot();
    const before = session.phase;
    if (screen === 'playing') session.step(1 / 60, snapshot.fallenIds.length, snapshot.settled);
    if (before === 'settling' && session.phase !== 'settling') { simulation.retireProjectile(); snapshot = simulation.snapshot(); }
    accumulator -= 1 / 60; finish();
    if (session.phase === 'lost') { accumulator = 0; break; }
   }
   if (accumulator >= 1 / 60) accumulator = 0;
   if (screen === 'won') celebration -= dt;
  } else accumulator = 0;
  if (screen !== 'error') renderer?.update(snapshot, aim, dt, { isAiming: canAim(), dragging, reducedMotion: motion.matches,
   previousSnapshot, interpolationAlpha: screen === 'playing' ? accumulator / (1 / 60) : 1 });
  renderUI();
 } catch (e) { fail(e); }
 frame = requestAnimationFrame(tick);
}

function inspect() {
 return { ...model(), aim: { ...aim }, physics: { bodyCount: snapshot.bodyCount, fallenIds: [...snapshot.fallenIds],
  projectile: snapshot.projectile ? { position: { ...snapshot.projectile.position } } : null },
  audio: audio.diagnostics(), renderer: renderer?.diagnostics() ?? null };
}
// Read-only diagnostics support reproducible QA without any score, unlock or physics mutation.
Object.defineProperty(window, '__tidal', { value: Object.freeze({ inspect }), configurable: true });
const unregisterTools = registerGameTools({
 inspect, start: id => { if (!Number.isInteger(id) || id < 1 || id > store.read().unlocked) throw new Error('关卡尚未解锁。'); startLevel(id); },
 aim: next => { if (!canAim()) throw new Error('当前不能瞄准。'); aim = clampAim(next); },
 fire: () => { if (!fire()) throw new Error('当前不能发射。'); },
});
const onVisibility = () => { if (document.hidden) pause(); };
const onResize = () => { input.cancel(); renderer?.resize(); };
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('resize', onResize);
window.addEventListener('pagehide', event => {
 if (event.persisted) { pause(); return; }
 disposed = true; cancelAnimationFrame(frame); input.dispose(); simulation?.dispose(); renderer?.dispose(); audio.dispose(); ui.dispose(); unregisterTools();
 document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('resize', onResize);
});

renderUI();
void (async () => {
 try {
  if (typeof WebAssembly === 'undefined') throw new Error('此浏览器不支持 WebAssembly，请使用新版浏览器。');
  renderer = new GameRenderer(canvas, () => fail(new Error('图形显示暂时中断，请重新加载游戏。')));
  await initializePhysics(); loadLevel(1); screen = 'home'; renderUI(); frame = requestAnimationFrame(tick);
 } catch (e) { fail(e); }
})();
