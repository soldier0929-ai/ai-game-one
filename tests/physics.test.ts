import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { GameSession } from '../src/game';
import solutions from './level-solutions.json';
import { Simulation, initializePhysics } from '../src/simulation';
import { BALL_RADIUS, GRAVITY, SHOT_SPEED, clampAim, launchVelocity, trajectoryPoints } from '../src/trajectory';
import type { LevelDefinition } from '../src/types';

beforeAll(async () => { await initializePhysics(); });

describe('physical towers', () => {
  it('provides the required eight level counts and ammo budgets', () => {
    expect(LEVELS.map(level => level.blocks.length)).toEqual([18, 24, 30, 32, 36, 42, 48, 60]);
    expect(LEVELS.map(level => level.ammo)).toEqual([3, 3, 4, 4, 4, 5, 5, 5]);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('keeps level %i stable before its first shot', index => {
    const simulation = new Simulation(LEVELS[index]);
    for (let frame = 0; frame < 300; frame++) simulation.step();
    const snapshot = simulation.snapshot();
    expect(snapshot.blocks).toHaveLength(LEVELS[index].blocks.length);
    expect(snapshot.fallenIds).toHaveLength(0);
    expect(snapshot.blocks.every(block => block.position.y > -.1)).toBe(true);
    for (const pose of snapshot.blocks) {
      const initial = LEVELS[index].blocks.find(block => block.id === pose.id)!.position;
      expect(Math.hypot(pose.position.x - initial.x, pose.position.y - initial.y, pose.position.z - initial.z)).toBeLessThan(.05);
      expect(Math.abs(pose.rotation.w)).toBeGreaterThan(.995);
    }
    simulation.dispose();
  });
  it('collides with a thin real body at full shot speed without tunneling', () => {
    const level: LevelDefinition = { id: 0, title: 'CCD fixture', hint: '', ammo: 1, platform: {width: 2, depth: 1.4, height: 2}, cannon: {x: 0, y: .6, z: 4}, defaultAim: {yaw: 0, pitch: 0}, blocks: [{id: 'thin', position: {x: 0, y: .6, z: 0}, size: {x: 1, y: 1.2, z: .08}, color: '#fff'}] };
    const simulation = new Simulation(level);
    expect(simulation.fire(level.defaultAim)).toBe(true);
    expect(simulation.fire(level.defaultAim)).toBe(false);
    let impacts = 0;
    for (let frame = 0; frame < 60; frame++) impacts += simulation.step().filter(event => event.type === 'impact').length;
    const block = simulation.snapshot().blocks[0];
    expect(impacts).toBeGreaterThan(0);
    expect(block === undefined || Math.abs(block.position.z) > .2).toBe(true);
    simulation.dispose();
  });
  it('scores each falling body once and frees all owned bodies', () => {
    const simulation = new Simulation(LEVELS[0]);
    simulation.fire({yaw: 0, pitch: .05});
    let splashes = 0;
    for (let frame = 0; frame < 900; frame++) splashes += simulation.step().filter(event => event.type === 'splash').length;
    const snapshot = simulation.snapshot();
    expect(new Set(snapshot.fallenIds).size).toBe(snapshot.fallenIds.length);
    expect(splashes).toBe(snapshot.fallenIds.length);
    expect(snapshot.bodyCount).toBe(1 + snapshot.blocks.length + (snapshot.projectile ? 1 : 0));
    simulation.retireProjectile();
    expect(simulation.snapshot().projectile).toBeNull();
    simulation.dispose();
    expect(simulation.snapshot().bodyCount).toBe(0);
    expect(simulation.fire(LEVELS[0].defaultAim)).toBe(false);
  });
});

describe('shared trajectory', () => {
  it('uses one ballistic model for the guide and real launch', () => {
    const aim = clampAim({yaw: .1, pitch: .2});
    const velocity = launchVelocity(aim);
    expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeCloseTo(SHOT_SPEED);
    expect(velocity.z).toBeLessThan(0);
    expect(BALL_RADIUS).toBeGreaterThan(0);
    expect(GRAVITY).toBeLessThan(0);
    const origin = {x: 0, y: .8, z: 10};
    const points = trajectoryPoints(origin, aim);
    expect(points).toHaveLength(30);
    expect(points[0]).toEqual(origin);
    expect(points[1].z).toBeLessThan(points[0].z);
  });
});

describe('physical scoring boundaries', () => {
  it('waits for first fire and .25 seconds below the plinth before scoring', () => {
    const level: LevelDefinition = {...LEVELS[0], ammo: 1, blocks: [{id: 'unbalanced-fixture', position: {x: 8, y: .3, z: 0}, size: {x: .5, y: .5, z: .5}, color: '#fff'}]};
    const simulation = new Simulation(level);
    for (let frame = 0; frame < 120; frame++) simulation.step();
    expect(simulation.snapshot().fallenIds).toHaveLength(0);
    expect(simulation.snapshot().blocks).toHaveLength(1);
    simulation.fire(level.defaultAim);
    for (let frame = 0; frame < 14; frame++) simulation.step();
    expect(simulation.snapshot().fallenIds).toHaveLength(0);
    expect(simulation.step().filter(event => event.type === 'splash')).toHaveLength(1);
    expect(simulation.snapshot().fallenIds).toEqual(['unbalanced-fixture']);
    expect(simulation.step().filter(event => event.type === 'splash')).toHaveLength(0);
    simulation.retireProjectile();
    expect(simulation.fire(level.defaultAim)).toBe(false);
    simulation.dispose();
  });
  it('uses exactly the same ballistic arc for a free projectile', () => {
    const level: LevelDefinition = {...LEVELS[0], blocks: []};
    const simulation = new Simulation(level);
    const aim = {yaw: .2, pitch: .3};
    simulation.fire(aim);
    for (let frame = 0; frame < 6; frame++) simulation.step();
    const position = simulation.snapshot().projectile!.position;
    const velocity = launchVelocity(aim), time = .1;
    expect(position.x).toBeCloseTo(level.cannon.x + velocity.x * time, 3);
    expect(position.z).toBeCloseTo(level.cannon.z + velocity.z * time, 3);
    // Rapier integrates gravity discretely; the guide uses the analytic arc.
    expect(Math.abs(position.y - (level.cannon.y + velocity.y * time + .5 * GRAVITY * time * time))).toBeLessThan(.012);
    simulation.dispose();
  });
});

describe('invalid physical values', () => {
  it('rejects invalid initial transforms before creating a world', () => {
    const level = {...LEVELS[0], cannon: {x: Infinity, y: 0, z: 10}};
    expect(() => new Simulation(level)).toThrow(/物理/);
    const invalidBrick = {...LEVELS[0].blocks[0], position: {x: 0, y: NaN, z: 0}};
    expect(() => new Simulation({...LEVELS[0], blocks: [invalidBrick]})).toThrow(/物理/);
  });
});


describe('saved physical solutions under actual game rules', () => {
  it.each(solutions)('wins level $level within its legal ammo budget', solution => {
    const level = LEVELS.find(entry => entry.id === solution.level)!;
    const simulation = new Simulation(level);
    const game = new GameSession(level.blocks.length, level.ammo);
    expect(solution.shots.length).toBeLessThanOrEqual(level.ammo);
    for (let frame = 0; frame < solution.initialSteps; frame++) simulation.step();
    for (const shot of solution.shots) {
      expect(simulation.fire(shot)).toBe(true);
      expect(game.fire()).toBe(true);
      let frame = 0;
      while (game.phase === 'settling' && frame <= solution.maxStepsPerShot) {
        simulation.step();
        const snapshot = simulation.snapshot();
        game.step(1 / 60, snapshot.fallenIds.length, snapshot.settled);
        frame++;
      }
      simulation.retireProjectile();
    }
    expect(game.phase).toBe('won');
    expect(game.fallen).toBeGreaterThanOrEqual(Math.ceil(level.blocks.length * .8));
    expect(new Set(simulation.snapshot().fallenIds).size).toBe(game.fallen);
    simulation.dispose();
  });
});
