import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../src/audio';

class Param { value = 1; setValueAtTime = vi.fn(); exponentialRampToValueAtTime = vi.fn(); }
class Node {
  frequency = new Param(); gain = new Param(); type = 'sine'; onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Context {
  static instances: Context[] = []; currentTime = 0; state = 'suspended'; destination = new Node(); oscillators: Node[] = [];
  constructor() { Context.instances.push(this); }
  createGain() { return new Node(); }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}
afterEach(() => { vi.unstubAllGlobals(); Context.instances = []; });
describe('GameAudio', () => {
  it('is silent before user unlock and caps live synth voices after unlock', async () => {
    vi.stubGlobal('AudioContext', Context); const sound = new GameAudio(); sound.play('shot');
    expect(Context.instances).toHaveLength(0); await sound.unlock();
    for (let i = 0; i < 30; i++) sound.play('fire', 0.8);
    expect(sound.diagnostics().activeVoices).toBeLessThanOrEqual(sound.diagnostics().maxVoices);
    expect(Context.instances[0].oscillators.length).toBeLessThanOrEqual(sound.diagnostics().maxVoices); sound.dispose();
  });
  it('stops existing voices when muted and ignores new sounds while muted or suspended', async () => {
    vi.stubGlobal('AudioContext', Context); const sound = new GameAudio(); await sound.unlock(); sound.play('shot');
    expect(sound.diagnostics().activeVoices).toBeGreaterThan(0); sound.setMuted(true);
    expect(sound.diagnostics().activeVoices).toBe(0); sound.play('shot'); expect(sound.diagnostics().activeVoices).toBe(0);
    sound.setMuted(false); await sound.suspend(); sound.play('shot'); expect(sound.diagnostics().activeVoices).toBe(0);
    await sound.resume(); sound.play('shot'); expect(sound.diagnostics().activeVoices).toBeGreaterThan(0); sound.dispose();
  });
  it('disconnects finished voices and closes the context idempotently', async () => {
    vi.stubGlobal('AudioContext', Context); const sound = new GameAudio(); await sound.unlock(); sound.play('click');
    const osc = Context.instances[0].oscillators[0]; osc.onended?.(); expect(sound.diagnostics().activeVoices).toBe(0); expect(osc.disconnect).toHaveBeenCalled();
    sound.play('shot'); sound.dispose(); sound.dispose(); await sound.unlock();
    expect(sound.diagnostics().disposed).toBe(true); expect(sound.diagnostics().activeVoices).toBe(0); expect(Context.instances[0].close).toHaveBeenCalledTimes(1);
  });
  it('throttles impact contacts while allowing later collisions to sound', async () => {
    vi.stubGlobal('AudioContext', Context); const sound = new GameAudio(); await sound.unlock();
    const context = Context.instances[0]; sound.play('impact');
    context.currentTime = 0.03; sound.play('impact'); expect(context.oscillators).toHaveLength(1);
    context.currentTime = 0.061; sound.play('impact'); expect(context.oscillators).toHaveLength(2); sound.dispose();
  });
  it('gracefully remains silent when Web Audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined); vi.stubGlobal('webkitAudioContext', undefined);
    const sound = new GameAudio(); await sound.unlock(); sound.play('win'); expect(sound.diagnostics().supported).toBe(false); sound.dispose();
  });
});
