// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameUI } from '../src/ui';
import type { GameViewModel } from '../src/types';

const model: GameViewModel = {
  screen: 'home', phase: 'aiming', currentLevel: 1, levelName: '初见潮汐', levelHint: '瞄准底层',
  ammo: 3, maxAmmo: 3, fallen: 0, total: 18, target: 15, stars: 0, bestStars: [3, 1, 0, 0, 0, 0, 0, 0],
  unlocked: 2, muted: false, storageWarning: false, settlingSeconds: 0, error: '', dragging: false,
};
describe('GameUI', () => {
  let root: HTMLDivElement;
  beforeEach(() => { document.body.innerHTML = ''; root = document.createElement('div'); document.body.append(root); });
  it('dispatches the primary start action exactly once', () => {
    const act = vi.fn(); const ui = new GameUI(root, act); ui.render(model);
    root.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'start' }); ui.dispose();
  });
  it('shows eight level buttons and prevents locked levels from dispatching', () => {
    const act = vi.fn(); const ui = new GameUI(root, act); ui.render({ ...model, screen: 'levels' });
    expect(root.querySelectorAll('[data-level]')).toHaveLength(8);
    const locked = root.querySelector<HTMLButtonElement>('[data-level="3"]')!;
    expect(locked.disabled).toBe(true); locked.click(); locked.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(act).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-level="2"]')!.click(); expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'level', id: 2 });
    expect(root.querySelector('[data-level="1"]')!.textContent).toContain('★★★'); ui.dispose();
  });
  it('retains button identity and keyboard focus while HUD values update', () => {
    const ui = new GameUI(root, vi.fn()); ui.render({ ...model, screen: 'playing' });
    const pause = root.querySelector<HTMLButtonElement>('[data-action="pause"]')!; pause.focus();
    ui.render({ ...model, screen: 'playing', fallen: 4, ammo: 2, dragging: true });
    expect(root.querySelector('[data-action="pause"]')).toBe(pause); expect(document.activeElement).toBe(pause);
    expect(root.querySelector('[data-field="fallen"]')!.textContent).toBe('4'); ui.dispose();
  });
  it('removes its delegated event listener and DOM on disposal', () => {
    const act = vi.fn(); const ui = new GameUI(root, act); ui.render(model);
    const old = root.querySelector<HTMLButtonElement>('[data-action="start"]')!;
    ui.dispose(); root.append(old); old.click(); expect(act).not.toHaveBeenCalled();
    ui.render(model); expect(root.querySelector('[data-action="levels"]')).toBeNull();
  });
  it('escapes errors and exposes mute state accessibly', () => {
    const ui = new GameUI(root, vi.fn()); ui.render({ ...model, screen: 'error', error: '<img src=x onerror=alert(1)>', muted: true });
    expect(root.querySelector('img')).toBeNull(); expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('[data-action="mute"]')!.getAttribute('aria-pressed')).toBe('true'); ui.dispose();
  });
});
