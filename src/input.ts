import type { Aim } from './types';
import { clampAim } from './trajectory';
export interface AimInputOptions {
  getAim: () => Aim;
  setAim: (aim: Aim) => void;
  canAim: () => boolean;
  fire: () => void;
  onPause: () => void;
  onGesture: () => void;
  onDragging: (dragging: boolean) => void;
}
interface Drag { id: number; x: number; y: number; width: number; aim: Aim }
/** Converts pointer/keyboard gestures into intents; the game remains the rule authority. */
export class AimInput {
  private drag: Drag | null = null;
  private disposed = false;
  private readonly previousTouchAction: string;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: AimInputOptions) {
    this.previousTouchAction = canvas.style.touchAction;
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('lostpointercapture', this.pointerCancel);
    window.addEventListener('keydown', this.key);
    window.addEventListener('resize', this.cancel);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private down = (event: PointerEvent): void => {
    if (this.disposed || this.drag || event.isPrimary === false || event.button !== 0 || !this.options.canAim()) return;
    event.preventDefault(); this.options.onGesture();
    const width = Math.max(1, this.canvas.getBoundingClientRect().width);
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width, aim: { ...this.options.getAim() } };
    this.canvas.style.touchAction = 'none';
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic/unsupported capture can still cancel safely. */ }
    this.options.onDragging(true);
  };
  private move = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (!this.options.canAim()) { this.cancel(); return; }
    event.preventDefault();
    this.options.setAim(clampAim({ yaw: drag.aim.yaw + (event.clientX - drag.x) / drag.width * 1.5,
      pitch: drag.aim.pitch + (drag.y - event.clientY) / drag.width * 1.5 }));
  };
  private up = (event: PointerEvent): void => {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    event.preventDefault();
    const fire = this.options.canAim(); this.cancel();
    if (fire) this.options.fire();
  };
  private pointerCancel = (event: PointerEvent): void => { if (this.drag?.id === event.pointerId) this.cancel(); };
  private visibility = (): void => { if (document.hidden) this.cancel(); };
  private key = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    if (event.key === 'Escape') {
      if (!event.repeat) { this.cancel(); this.options.onPause(); }
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, button, [contenteditable], [role="button"]')) return;
    if (!this.options.canAim() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (!event.repeat) { this.options.onGesture(); this.cancel(); this.options.fire(); }
      return;
    }
    const aim = { ...this.options.getAim() };
    switch (event.key) {
      case 'ArrowLeft': aim.yaw -= .025; break;
      case 'ArrowRight': aim.yaw += .025; break;
      case 'ArrowUp': aim.pitch += .025; break;
      case 'ArrowDown': aim.pitch -= .025; break;
      default: return;
    }
    event.preventDefault(); this.options.onGesture(); this.options.setAim(clampAim(aim));
  };
  cancel = (): void => {
    const drag = this.drag; if (!drag) return;
    this.drag = null;
    this.canvas.style.touchAction = this.previousTouchAction;
    try { if (this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id); } catch { /* Capture may already be gone. */ }
    this.options.onDragging(false);
  };
  dispose(): void {
    if (this.disposed) return;
    this.cancel(); this.disposed = true;
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.pointerCancel);
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('resize', this.cancel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.style.touchAction = this.previousTouchAction;
  }
}
