import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { calculateViewFrame, applyInterpolatedPose } from '../src/renderer';
import type { LevelDefinition } from '../src/types';

const level: LevelDefinition = {
  id: 8, title: 'Tower', hint: '', ammo: 5,
  platform: { width: 8, depth: 5, height: 2.4 },
  cannon: { x: 0, y: .8, z: 10 }, defaultAim: { yaw: 0, pitch: .2 },
  blocks: [{ id: 'tall', position: { x: 2.5, y: 6.5, z: -1 }, size: { x: 1, y: 1, z: 1 }, color: '#f77966' }],
};

// Shrinking either frame dimension or omitting the cannon/tower from the bounds
// must break these assertions: they verify playable framing, not a formula.
describe('responsive diorama framing', () => {
  test.each([1440 / 900, 390 / 844, 844 / 390])('keeps platform, tall target and muzzle visible at aspect %s', aspect => {
    const frame = calculateViewFrame(level, aspect);
    const camera = new THREE.OrthographicCamera(-frame.halfWidth, frame.halfWidth, frame.halfHeight, -frame.halfHeight, .1, 120);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.updateMatrixWorld();
    const landmarks = [
      new THREE.Vector3(-4, -2.4, -2.5), new THREE.Vector3(4, 0, 2.5),
      new THREE.Vector3(3, 7, -1.5), new THREE.Vector3(-1, -.9, 11.5),
      new THREE.Vector3(1, 1.5, 10),
    ];
    for (const point of landmarks) {
      const ndc = point.project(camera);
      expect(Math.abs(ndc.x)).toBeLessThan(.92);
      expect(Math.abs(ndc.y)).toBeLessThan(.85);
      expect(Math.abs(ndc.z)).toBeLessThan(1);
    }
  });
});


describe('fixed step pose interpolation', () => {
  test('blends position and orientation without mutating physics poses', () => {
    const mesh = new THREE.Object3D();
    const previous = { id: 'brick', position: { x: 0, y: 2, z: 4 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const current = { id: 'brick', position: { x: 4, y: 6, z: 8 }, rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
    const source = JSON.stringify({ previous, current });
    applyInterpolatedPose(mesh, current, previous, .5);
    expect(mesh.position.toArray()).toEqual([2, 4, 6]);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 4);
    expect(JSON.stringify({ previous, current })).toBe(source);
  });
  test('uses current pose for new bodies and callers without interpolation', () => {
    const mesh = new THREE.Object3D();
    const current = { id: 'new-ball', position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const old = { ...current, id: 'old-ball', position: { x: -20, y: -20, z: -20 } };
    applyInterpolatedPose(mesh, current, old, 0);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    applyInterpolatedPose(mesh, current);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });
});
