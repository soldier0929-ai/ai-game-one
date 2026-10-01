import RAPIER from '@dimforge/rapier3d-compat';
import type { Aim, BodyPose, LevelDefinition, PhysicsEvent, PhysicsSnapshot } from './types';
import { BALL_RADIUS, GRAVITY, launchVelocity } from './trajectory';

let initialization: Promise<void> | undefined;
let ready = false;
export function initializePhysics(): Promise<void> {
  initialization ??= RAPIER.init().then(() => { ready = true; });
  return initialization;
}

const FIXED_STEP = 1 / 60;
const FALL_DELAY = .25;

/** Owns one Rapier world. Gameplay only adds shots and observes physical outcomes. */
export class Simulation {
  private world: RAPIER.World | null;
  private queue: RAPIER.EventQueue | null;
  private bodies = new Map<string, RAPIER.RigidBody>();
  private belowFor = new Map<string, number>();
  private fallen = new Set<string>();
  private projectile: RAPIER.RigidBody | null = null;
  private projectileAge = 0;
  private fired = false;
  private accumulator = 0;
  private shots = 0;

  constructor(private readonly level: LevelDefinition) {
    if (!ready) throw new Error('物理引擎尚未就绪，请稍后重试。');
    assertFiniteVector(level.cannon);
    assertPositiveValues([level.platform.width, level.platform.depth, level.platform.height]);
    for (const block of level.blocks) {
      assertFiniteVector(block.position);
      assertPositiveValues([block.size.x, block.size.y, block.size.z, block.density ?? 1.2]);
      if (block.rotation) assertFiniteVector(block.rotation);
    }
    this.world = new RAPIER.World({x: 0, y: GRAVITY, z: 0});
    this.world.numSolverIterations = 8;
    this.world.integrationParameters.maxCcdSubsteps = 4;
    this.queue = new RAPIER.EventQueue(true);
    const base = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -level.platform.height / 2, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(level.platform.width / 2, level.platform.height / 2, level.platform.depth / 2).setFriction(.55).setRestitution(.02), base);
    for (const block of level.blocks) {
      const descriptor = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(block.position.x, block.position.y, block.position.z)
        .setLinearDamping(.05).setAngularDamping(.08).setCanSleep(true);
      if (block.rotation) descriptor.setRotation(eulerQuaternion(block.rotation));
      const body = this.world.createRigidBody(descriptor);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(block.size.x / 2, block.size.y / 2, block.size.z / 2)
        .setDensity(block.density ?? 1.2).setFriction(.5).setRestitution(.03)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(15), body);
      this.bodies.set(block.id, body);
    }
  }

  fire(aim: Aim): boolean {
    if (!this.world || this.projectile || this.shots >= this.level.ammo) return false;
    const velocity = launchVelocity(aim);
    const origin = this.level.cannon;
    this.projectile = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z).setLinvel(velocity.x, velocity.y, velocity.z)
      .setCcdEnabled(true).setLinearDamping(0).setAngularDamping(.02));
    this.world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(4)
      .setFriction(.35).setRestitution(.08).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(15), this.projectile);
    this.fired = true;
    this.shots++;
    this.projectileAge = 0;
    return true;
  }

  step(dt = FIXED_STEP): PhysicsEvent[] {
    if (!this.world || !this.queue || !Number.isFinite(dt) || dt <= 0) return [];
    this.accumulator += Math.min(dt, .1);
    const events: PhysicsEvent[] = [];
    while (this.accumulator + 1e-9 >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      this.world.timestep = FIXED_STEP;
      this.world.step(this.queue);
      // Stop before emitting scores or snapshots if the engine loses numerical validity.
      for (const body of this.bodies.values()) assertBodyFinite(body);
      if (this.projectile) assertBodyFinite(this.projectile);
      let strongestImpact: PhysicsEvent | undefined;
      this.queue.drainContactForceEvents(contact => {
        if (!this.fired) return;
        const force = contact.totalForceMagnitude();
        if (force < 35) return;
        const collider = this.world?.getCollider(contact.collider1());
        if (!collider) return;
        const position = collider.translation();
        const impact: PhysicsEvent = {type: 'impact', position: {...position}, strength: Math.min(1, force / 1800)};
        if (!strongestImpact || impact.strength > strongestImpact.strength) strongestImpact = impact;
      });
      if (strongestImpact) events.push(strongestImpact);
      for (const [id, body] of this.bodies) {
        const position = body.translation();
        if (!this.fired) continue;
        // A brick counts only after its center stays below the entire plinth.
        const below = position.y < -this.level.platform.height;
        const duration = below ? (this.belowFor.get(id) ?? 0) + FIXED_STEP : 0;
        this.belowFor.set(id, duration);
        if (duration + 1e-9 < FALL_DELAY) continue;
        this.fallen.add(id);
        events.push({type: 'splash', position: {...position}, strength: .5});
        this.world.removeRigidBody(body);
        this.bodies.delete(id);
        this.belowFor.delete(id);
      }
      if (this.projectile) {
        this.projectileAge += FIXED_STEP;
        const position = this.projectile.translation();
        if (position.y < -this.level.platform.height - 3 || this.projectileAge > 8 || Math.abs(position.x) > 30 || Math.abs(position.z) > 30) this.retireProjectile();
      }
    }
    return events;
  }

  retireProjectile(): void {
    if (this.world && this.projectile) this.world.removeRigidBody(this.projectile);
    this.projectile = null;
  }

  snapshot(): PhysicsSnapshot {
    return {
      blocks: Array.from(this.bodies, ([id, body]) => pose(id, body)),
      projectile: this.projectile ? pose('projectile', this.projectile) : null,
      fallenIds: Array.from(this.fallen),
      bodyCount: this.world?.bodies.len() ?? 0,
      settled: Array.from(this.bodies.values()).every(isResting) && (!this.projectile || isResting(this.projectile)),
    };
  }

  dispose(): void {
    if (!this.world) return;
    this.queue?.free();
    this.world.free();
    this.world = null;
    this.queue = null;
    this.projectile = null;
    this.bodies.clear();
    this.belowFor.clear();
  }
}

function pose(id: string, body: RAPIER.RigidBody): BodyPose {
  assertBodyFinite(body);
  return {id, position: {...body.translation()}, rotation: {...body.rotation()}};
}

function eulerQuaternion(rotation: {x: number; y: number; z: number}) {
  const cx = Math.cos(rotation.x / 2), sx = Math.sin(rotation.x / 2);
  const cy = Math.cos(rotation.y / 2), sy = Math.sin(rotation.y / 2);
  const cz = Math.cos(rotation.z / 2), sz = Math.sin(rotation.z / 2);
  return {x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz, z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz};
}

function isResting(body: RAPIER.RigidBody): boolean {
  if (body.isSleeping()) return true;
  const linear = body.linvel(), angular = body.angvel();
  return Math.hypot(linear.x, linear.y, linear.z) < .08 && Math.hypot(angular.x, angular.y, angular.z) < .12;
}

function assertFiniteVector(vector: {x: number; y: number; z: number}): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error('物理数据异常，请重新开始本关。');
}

function assertPositiveValues(values: number[]): void {
  if (!values.every(value => Number.isFinite(value) && value > 0)) throw new Error('物理尺寸或质量异常，请重新开始本关。');
}

function assertBodyFinite(body: RAPIER.RigidBody): void {
  assertFiniteVector(body.translation());
  assertFiniteVector(body.linvel());
  assertFiniteVector(body.angvel());
  const rotation = body.rotation();
  assertFiniteVector(rotation);
  if (!Number.isFinite(rotation.w)) throw new Error('物理旋转异常，请重新开始本关。');
}
