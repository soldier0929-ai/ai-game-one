import { describe, it, expect } from 'vitest';
import { GameSession, victoryTarget, starsForAmmo } from '../src/game';

describe('game rules', () => {
 it('rounds up targets and awards stars by remaining ammo', () => {
  expect([18,24,30,32,36,42,48,60].map(victoryTarget)).toEqual([15,20,24,26,29,34,39,48]);
  expect([0,1,2,5].map(starsForAmmo)).toEqual([1,2,3,3]);
 });
 it('rejects repeated fire and observes before permitting another shot', () => {
  const g = new GameSession(18,3); expect(g.fire()).toBe(true); expect(g.fire()).toBe(false); expect(g.ammo).toBe(2);
  g.step(.59,0,true); expect(g.phase).toBe('settling'); g.step(.02,0,true); expect(g.phase).toBe('aiming');
 });
 it('allows a last-shot collapse before failure and ends at six simulated seconds', () => {
  const g = new GameSession(18,1); g.fire(); g.step(5.9,14,false); expect(g.phase).toBe('settling');
  g.step(.05,15,false); expect(g.phase).toBe('won'); expect(g.stars).toBe(1);
  const miss = new GameSession(18,1); miss.fire(); miss.step(5.99,0,false); expect(miss.phase).toBe('settling'); miss.step(.02,0,false); expect(miss.phase).toBe('lost');
 });
 it('freezes pause timers and disallows paused and terminal shooting', () => {
  const g = new GameSession(18,3); g.fire(); g.pause(); g.step(100,18,true); expect(g.elapsed).toBe(0); expect(g.fallen).toBe(0); expect(g.fire()).toBe(false);
  g.resume(); g.step(.1,15,false); expect(g.phase).toBe('won'); expect(g.fire()).toBe(false); expect(g.ammo).toBe(2); expect(g.stars).toBe(3);
 });
 it('scores a delayed collapse in aiming and never loses recorded progress', () => {
  const g = new GameSession(24,3); g.fire(); g.step(6,12,false); expect(g.phase).toBe('aiming');
  g.step(.1,0,false); expect(g.fallen).toBe(12); g.step(.1,20,false); expect(g.phase).toBe('won');
 });
 it('ends the observation after exactly 360 fixed steps', () => {
  const g = new GameSession(18,1); g.fire();
  for (let i=0;i<360;i++) g.step(1/60,0,false);
  expect(g.phase).toBe('lost');
 });
});
