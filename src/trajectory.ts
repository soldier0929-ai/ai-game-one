import type { Aim, Vec3 } from './types';

export const SHOT_SPEED = 22;
export const BALL_RADIUS = .46;
export const GRAVITY = -9.81;
export const MIN_PITCH = .025;
export const MAX_PITCH = .62;
export const MAX_YAW = .30;

export function clampAim(aim: Aim): Aim {
  return {
    yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, Number.isFinite(aim.yaw) ? aim.yaw : 0)),
    pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, Number.isFinite(aim.pitch) ? aim.pitch : .08)),
  };
}

export function launchVelocity(aim: Aim): Vec3 {
  const safe = clampAim(aim);
  const horizontal = SHOT_SPEED * Math.cos(safe.pitch);
  return {x: horizontal * Math.sin(safe.yaw), y: SHOT_SPEED * Math.sin(safe.pitch), z: -horizontal * Math.cos(safe.yaw)};
}

export function trajectoryPoints(origin: Vec3, aim: Aim, count = 30): Vec3[] {
  const velocity = launchVelocity(aim);
  return Array.from({length: Math.max(0, Math.floor(count))}, (_, index) => {
    const time = index * .06;
    return {x: origin.x + velocity.x * time, y: origin.y + velocity.y * time + .5 * GRAVITY * time * time, z: origin.z + velocity.z * time};
  });
}
