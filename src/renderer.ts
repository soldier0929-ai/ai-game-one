import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALL_RADIUS, trajectoryPoints } from './trajectory';
import type { Aim, BodyPose, LevelDefinition, PhysicsEvent, PhysicsSnapshot, RendererState } from './types';

const SEA_Y = -2.65;
const COLORS = { navy: '#143c50', cream: '#fff0cf', gold: '#ffcd64', coral: '#f57f6d', teal: '#4abfb6', sea: '#167d83' };

/** Framing uses projected world bounds, so tall towers and the cannon fit in every orientation. */
export function calculateViewFrame(level: LevelDefinition, aspect: number) {
  const safeAspect = Math.max(.2, Math.min(5, aspect || 1));
  const bounds = new THREE.Box3(
    new THREE.Vector3(-level.platform.width / 2 - .35, -level.platform.height, -level.platform.depth / 2 - .35),
    new THREE.Vector3(level.platform.width / 2 + .35, .35, level.platform.depth / 2 + .35),
  );
  for (const block of level.blocks) {
    // Rotation may broaden a block, so use a generous radius for rotated layouts.
    const radius = block.rotation ? Math.hypot(block.size.x, block.size.y, block.size.z) / 2 : 0;
    bounds.expandByPoint(new THREE.Vector3(block.position.x - (radius || block.size.x / 2), block.position.y - (radius || block.size.y / 2), block.position.z - (radius || block.size.z / 2)));
    bounds.expandByPoint(new THREE.Vector3(block.position.x + (radius || block.size.x / 2), block.position.y + (radius || block.size.y / 2), block.position.z + (radius || block.size.z / 2)));
  }
  bounds.expandByPoint(new THREE.Vector3(level.cannon.x - 1.45, level.cannon.y - 1.8, level.cannon.z - .7));
  bounds.expandByPoint(new THREE.Vector3(level.cannon.x + 1.45, level.cannon.y + .8, level.cannon.z + 2.0));
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(safeAspect < .8 ? .32 : .57, .84, 1).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const relative = new THREE.Vector3(x, y, z).sub(target);
    const px = relative.dot(right), py = relative.dot(up);
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  target.addScaledVector(right, (minX + maxX) / 2).addScaledVector(up, (minY + maxY) / 2);
  const halfHeight = Math.max((maxY - minY) / 2 / .73, (maxX - minX) / 2 / safeAspect / .86);
  return { target, position: target.clone().addScaledVector(direction, 36), halfHeight, halfWidth: halfHeight * safeAspect };
}

const interpolationPosition = new THREE.Vector3();
const interpolationRotation = new THREE.Quaternion();

/** Interpolate matching live bodies only; a newly spawned projectile starts at its true muzzle. */
export function applyInterpolatedPose(mesh: THREE.Object3D, current: BodyPose, previous?: BodyPose, alpha = 1) {
  const amount = Number.isFinite(alpha) ? THREE.MathUtils.clamp(alpha, 0, 1) : 1;
  const p = current.position, q = current.rotation;
  mesh.position.set(p.x, p.y, p.z);
  mesh.quaternion.set(q.x, q.y, q.z, q.w);
  if (!previous || previous.id !== current.id || amount === 1) return;
  const oldP = previous.position, oldQ = previous.rotation;
  interpolationPosition.copy(mesh.position);
  interpolationRotation.copy(mesh.quaternion);
  mesh.position.set(oldP.x, oldP.y, oldP.z).lerp(interpolationPosition, amount);
  mesh.quaternion.set(oldQ.x, oldQ.y, oldQ.z, oldQ.w).slerp(interpolationRotation, amount);
}

type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; duration: number; size: number };
type Ripple = { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; duration: number };

export class GameRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 120);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly colorMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly world = new THREE.Group();
  private readonly sunlight: THREE.DirectionalLight;
  private readonly platform = new THREE.Group();
  private readonly targets = new THREE.Group();
  private readonly cannon = new THREE.Group();
  private readonly cannonBody = new THREE.Group();
  private readonly cannonBase = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly dots: THREE.Mesh[] = [];
  private readonly particles: Particle[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly buoyGroups: THREE.Group[] = [];
  private readonly box: THREE.BufferGeometry;
  private readonly cylinder: THREE.BufferGeometry;
  private readonly sphere: THREE.BufferGeometry;
  private readonly reticle: THREE.Group;
  private readonly ball: THREE.Mesh;
  private readonly flash: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly baseCamera = new THREE.Vector3();
  private readonly targetCamera = new THREE.Vector3();
  private level: LevelDefinition | null = null;
  private elapsed = 0;
  private recoil = 0;
  private shake = 0;
  private reducedMotion = false;
  private disposed = false;
  private contextLost = false;
  private readonly onLost: (event: Event) => void;

  constructor(private readonly canvas: HTMLCanvasElement, onContextLost: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#8ac9c2');
    this.scene.fog = new THREE.Fog('#8ac9c2', 48, 85);
    this.scene.add(this.world, this.platform, this.targets, this.cannonBase, this.cannon);
    this.box = this.keepGeometry(new RoundedBoxGeometry(1, 1, 1, 1, .055));
    this.cylinder = this.keepGeometry(new THREE.CylinderGeometry(1, 1, 1, 20));
    this.sphere = this.keepGeometry(new THREE.IcosahedronGeometry(1, 1));
    this.scene.add(new THREE.HemisphereLight('#fff7df', '#277783', 2.1));
    const sun = this.sunlight = new THREE.DirectionalLight('#fff3cd', 3.3);
    sun.position.set(-9, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: .5, far: 55 });
    sun.shadow.bias = -.0005;
    sun.shadow.normalBias = .035;
    this.scene.add(sun, sun.target);
    this.buildHarbour();
    this.batchStaticWorld();
    this.buildCannon();
    this.ball = this.mesh(this.sphere, this.material(COLORS.navy, .3), this.scene);
    this.ball.scale.setScalar(BALL_RADIUS);
    this.ball.visible = false;
    const dotMaterial = this.keepMaterial(new THREE.MeshBasicMaterial({ color: '#fff9dc', transparent: true, opacity: .85, depthWrite: false }));
    for (let i = 0; i < 30; i++) {
      const dot = this.mesh(this.sphere, dotMaterial, this.scene, false);
      dot.scale.setScalar(.052 + i * .002);
      dot.visible = false;
      this.dots.push(dot);
    }
    this.reticle = this.buildReticle();
    const flashMaterial = this.keepMaterial(new THREE.MeshBasicMaterial({ color: '#fff0a1', transparent: true, opacity: 0, depthWrite: false }));
    this.flash = this.mesh(this.sphere, flashMaterial, this.cannonBody, false);
    this.flash.position.z = -.2;
    this.flash.scale.set(.3, .3, .48);
    this.flash.visible = false;
    const particleMaterial = this.material(COLORS.cream, .65);
    for (let i = 0; i < 36; i++) {
      const mesh = this.mesh(this.sphere, particleMaterial, this.scene, false);
      mesh.visible = false;
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0, duration: 1, size: 1 });
    }
    const ringGeometry = this.keepGeometry(new THREE.RingGeometry(.84, 1, 40));
    for (let i = 0; i < 6; i++) {
      const material = this.keepMaterial(new THREE.MeshBasicMaterial({ color: '#e2fff1', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.ripples.push({ mesh, life: 0, duration: 1 });
    }
    this.onLost = event => { event.preventDefault(); this.contextLost = true; onContextLost(); };
    canvas.addEventListener('webglcontextlost', this.onLost);
    this.resize();
  }

  private keepGeometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private keepMaterial<T extends THREE.Material>(material: T): T { this.materials.add(material); return material; }
  private material(color: string, roughness = .65) {
    const key = `${color}:${roughness}`;
    let material = this.colorMaterials.get(key);
    if (!material) {
      material = this.keepMaterial(new THREE.MeshStandardMaterial({ color, roughness, metalness: roughness < .4 ? .25 : 0 }));
      this.colorMaterials.set(key, material);
    }
    return material;
  }
  private mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geometry: G, material: M, parent: THREE.Object3D, shadow = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }
  private cube(parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = this.mesh(this.box, this.material(color), parent);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); return mesh;
  }
  private drum(parent: THREE.Object3D, color: string, x: number, y: number, z: number, radius: number, height: number, roughness = .65) {
    const mesh = this.mesh(this.cylinder, this.material(color, roughness), parent);
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); return mesh;
  }

  private buildHarbour() {
    const waterGeometry = this.keepGeometry(new THREE.PlaneGeometry(180, 180));
    const water = this.mesh(waterGeometry, this.material(COLORS.sea, .82), this.world, false);
    water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y; water.receiveShadow = true;
    // Large soft wave marks form a graphic ocean without animated shaders or textures.
    const waveMaterial = this.keepMaterial(new THREE.MeshBasicMaterial({ color: '#8ad8c7', transparent: true, opacity: .2, depthWrite: false }));
    const waveGeometry = this.keepGeometry(new THREE.PlaneGeometry(1, 1));
    for (let i = 0; i < 32; i++) {
      const wave = this.mesh(waveGeometry, waveMaterial, this.world, false);
      const x = Math.sin(i * 23.2) * 18, z = Math.cos(i * 6.7) * 20;
      wave.position.set(x, SEA_Y + .008, z);
      wave.rotation.x = -Math.PI / 2; wave.rotation.z = -.08;
      wave.scale.set(1.1 + (i % 3) * .4, .028, 1);
    }
    this.island(-10.2, -5.2, 2.1, SEA_Y + .45, true);
    this.island(8.8, -7.5, 2.3, SEA_Y + .35, true);
    this.island(-9, 12.4, 1.5, SEA_Y + .22, false);
    this.island(12.8, 7.2, 1.4, SEA_Y + .24, false);
    // A pair of marker buoys leads the eye into the target harbour.
    this.buoy(-4.1, 4.1, COLORS.coral);
    this.buoy(4.0, 3.5, COLORS.gold);
    this.buoy(6.4, -1.2, COLORS.cream);
  }

  /** Bake immobile scenery by material to keep the harbour inexpensive on mobile. */
  private batchStaticWorld() {
    this.world.updateMatrixWorld(true);
    const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }>();
    const staticRoots = this.world.children.filter(child => !this.buoyGroups.includes(child as THREE.Group));
    for (const root of staticRoots) root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { material: object.material, cast: object.castShadow, receive: object.receiveShadow, parts: [] }; buckets.set(key, bucket); }
      // Convert every primitive to the same attribute/index layout before merging.
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      bucket.parts.push(geometry);
    });
    for (const root of staticRoots) this.world.remove(root);
    for (const bucket of buckets.values()) {
      const geometry = mergeGeometries(bucket.parts, false);
      for (const part of bucket.parts) part.dispose();
      if (!geometry) throw new Error('Unable to batch harbour geometry');
      const mesh = this.mesh(this.keepGeometry(geometry), bucket.material, this.world, false);
      mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive;
    }
  }

  private island(x: number, z: number, radius: number, top: number, palm: boolean) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.world.add(group);
    this.drum(group, '#308e8b', 0, SEA_Y + .03, 0, radius * 1.3, .09);
    this.drum(group, '#efca88', 0, (top + SEA_Y) / 2, 0, radius, top - SEA_Y);
    this.drum(group, '#fce6ac', 0, top + .03, 0, radius * .98, .12);
    this.drum(group, '#75b996', .15, top + .1, -.1, radius * .6, .1);
    if (palm) {
      const trunk = this.drum(group, '#c7955e', -.25, top + .9, 0, .105, 1.8);
      trunk.rotation.z = -.12;
      for (let i = 0; i < 5; i++) {
        const leaf = this.mesh(this.sphere, this.material(i % 2 ? '#378d79' : '#58ab87'), group);
        const angle = i / 5 * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * .48 - .4, top + 1.85, Math.sin(angle) * .48);
        leaf.scale.set(.9, .11, .28); leaf.rotation.y = -angle; leaf.rotation.z = Math.cos(angle) * .2;
      }
      this.cube(group, COLORS.coral, .9, top + .27, .4, .4, .4, .4).rotation.y = .25;
    }
  }

  private buoy(x: number, z: number, color: string) {
    const group = new THREE.Group(); group.position.set(x, SEA_Y, z); this.world.add(group); this.buoyGroups.push(group);
    this.drum(group, COLORS.navy, 0, .05, 0, .38, .12);
    this.drum(group, color, 0, .26, 0, .26, .38);
    this.drum(group, COLORS.cream, 0, .35, 0, .265, .1);
    this.drum(group, COLORS.navy, 0, .71, 0, .035, .6);
    this.cube(group, color, .17, .91, 0, .33, .19, .035);
  }

  private buildCannon() {
    // The rear of the barrel extends from a fixed muzzle at the simulation origin.
    this.cannon.add(this.cannonBody);
    const barrel = this.drum(this.cannonBody, COLORS.navy, 0, 0, .64, .255, 1.25, .3);
    barrel.rotation.x = Math.PI / 2;
    for (const z of [.03, .27, 1.15]) {
      const collar = this.drum(this.cannonBody, COLORS.gold, 0, 0, z, z === .03 ? .31 : .275, .12, .27);
      collar.rotation.x = Math.PI / 2;
    }
    const muzzle = this.drum(this.cannonBody, '#0b2432', 0, 0, -.035, .225, .018);
    muzzle.rotation.x = Math.PI / 2;
    const breech = this.mesh(this.sphere, this.material(COLORS.gold, .3), this.cannonBody);
    breech.position.z = 1.25; breech.scale.set(.27, .27, .22);
    this.cube(this.cannonBase, COLORS.navy, 0, -.73, .77, .91, .32, 1.24);
    this.cube(this.cannonBase, COLORS.coral, 0, -.49, .87, .56, .42, .45);
    for (const x of [-.63, .63]) {
      const wheel = this.drum(this.cannonBase, COLORS.navy, x, -.65, .87, .39, .2);
      wheel.rotation.z = Math.PI / 2;
      const hub = this.drum(this.cannonBase, COLORS.gold, x * 1.17, -.65, .87, .21, .055, .3);
      hub.rotation.z = Math.PI / 2;
    }
    this.drum(this.cannonBase, '#317e7c', 0, -1.65, .65, 1.65, .1);
    this.drum(this.cannonBase, '#eac183', 0, -1.27, .65, 1.4, .7);
    this.drum(this.cannonBase, COLORS.cream, 0, -.9, .65, 1.4, .12);
    const mark = this.cube(this.cannonBase, COLORS.gold, 0, -.825, -.2, .12, .018, .32);
    mark.castShadow = false;
  }

  private buildReticle() {
    const group = new THREE.Group(); this.scene.add(group);
    const material = this.keepMaterial(new THREE.MeshBasicMaterial({ color: '#fff4ba', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
    const ring = this.mesh(this.keepGeometry(new THREE.RingGeometry(.3, .33, 36)), material, group, false);
    ring.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const tick = this.mesh(this.box, material, group, false);
      const angle = i * Math.PI / 2;
      tick.position.set(Math.cos(angle) * .46, 0, Math.sin(angle) * .46);
      tick.scale.set(i % 2 ? .035 : .18, .025, i % 2 ? .18 : .035);
    }
    group.visible = false;
    return group;
  }

  setLevel(level: LevelDefinition) {
    if (this.disposed) return;
    this.level = level;
    this.targets.clear(); this.platform.clear(); this.meshes.clear();
    const { width: w, height: h, depth: d } = level.platform;
    this.cube(this.platform, '#176b70', 0, -h / 2, 0, w, h, d);
    this.cube(this.platform, COLORS.navy, 0, -.32, 0, w + .12, .28, d + .12);
    this.cube(this.platform, '#ebc584', 0, -.135, 0, w + .26, .22, d + .26);
    this.cube(this.platform, '#fff0cc', 0, -.038, 0, w + .17, .076, d + .17);
    // Inset wooden deck seams, rivets and striped dock fenders give the pedestal scale.
    for (let i = 1; i < 6; i++) this.cube(this.platform, '#e2c89a', (i / 6 - .5) * w, .007, 0, .018, .012, d * .93);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      this.drum(this.platform, COLORS.gold, x * (w / 2 - .17), .04, z * (d / 2 - .17), .06, .06, .3);
      const fender = this.drum(this.platform, COLORS.navy, x * (w / 2 + .075), -.72, z * (d / 2 - .25), .19, .56);
      this.drum(this.platform, COLORS.cream, fender.position.x, -.68, fender.position.z, .197, .1);
    }
    for (const block of level.blocks) {
      const mesh = this.mesh(this.box, this.material(block.color), this.targets);
      mesh.name = `block:${block.id}`;
      mesh.position.set(block.position.x, block.position.y, block.position.z);
      mesh.scale.set(block.size.x, block.size.y, block.size.z);
      if (block.rotation) mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
      // A small ivory stamp reads as an original toy block, and rotates with its body.
      const stamp = this.mesh(this.box, this.material('#fff0cf'), mesh, false);
      stamp.position.set(.22, .1, .503); stamp.scale.set(.14, .14, .012);
      this.meshes.set(block.id, mesh);
    }
    this.cannon.position.set(level.cannon.x, level.cannon.y, level.cannon.z);
    this.cannonBase.position.copy(this.cannon.position);
    this.recoil = 0; this.shake = 0;
    this.ball.visible = false;
    for (const p of this.particles) { p.life = 0; p.mesh.visible = false; }
    for (const r of this.ripples) { r.life = 0; r.mesh.visible = false; }
    this.resize();
  }

  update(snapshot: PhysicsSnapshot, aim: Aim, dt: number, state: RendererState) {
    if (this.disposed || this.contextLost || !this.level) return;
    const delta = Math.min(.05, Math.max(0, dt));
    this.elapsed += delta; this.reducedMotion = state.reducedMotion;
    for (const mesh of this.meshes.values()) mesh.visible = false;
    const previousBlocks = new Map(state.previousSnapshot?.blocks.map(body => [body.id, body]) ?? []);
    for (const body of snapshot.blocks) {
      const mesh = this.meshes.get(body.id);
      if (!mesh) continue;
      mesh.visible = true;
      applyInterpolatedPose(mesh, body, previousBlocks.get(body.id), state.interpolationAlpha);
    }
    this.ball.visible = !!snapshot.projectile;
    if (snapshot.projectile) {
      const body = snapshot.projectile;
      applyInterpolatedPose(this.ball, body, state.previousSnapshot?.projectile ?? undefined, state.interpolationAlpha);
    }
    this.cannon.rotation.set(aim.pitch, -aim.yaw, 0, 'YXZ');
    this.recoil = Math.max(0, this.recoil - delta * 3.8);
    this.cannonBody.position.z = state.reducedMotion ? 0 : Math.sin(this.recoil * Math.PI) * .26;
    this.flash.visible = this.recoil > .72;
    this.flash.material.opacity = Math.max(0, (this.recoil - .72) / .28);
    this.flash.scale.setScalar(.38 + (1 - this.recoil) * 1.2);
    this.updateAim(aim, state);
    this.updateEffects(delta, state.reducedMotion);
    this.camera.position.copy(this.baseCamera);
    if (!state.reducedMotion && this.shake > 0) {
      this.camera.position.x += Math.sin(this.elapsed * 87) * this.shake;
      this.camera.position.y += Math.cos(this.elapsed * 71) * this.shake * .55;
    }
    this.shake = Math.max(0, this.shake - delta * .5);
    this.camera.lookAt(this.targetCamera);
    if (!state.reducedMotion) this.buoyGroups.forEach((group, i) => {
      group.position.y = SEA_Y + Math.sin(this.elapsed * 1.5 + i) * .035;
      group.rotation.z = Math.sin(this.elapsed + i * 2) * .035;
    });
    this.renderer.render(this.scene, this.camera);
  }

  private updateAim(aim: Aim, state: RendererState) {
    const points = state.isAiming ? trajectoryPoints(this.level!.cannon, aim, this.dots.length) : [];
    let last: THREE.Vector3 | null = null;
    for (let i = 0; i < this.dots.length; i++) {
      const p = points[i];
      const visible = !!p && p.y > SEA_Y + .1 && p.z >= -this.level!.platform.depth / 2 - 2 && !last;
      this.dots[i].visible = visible;
      if (visible) {
        this.dots[i].position.set(p.x, p.y, p.z);
        const pulse = state.dragging && !state.reducedMotion ? 1 + Math.sin(this.elapsed * 8 - i * .4) * .15 : 1;
        this.dots[i].scale.setScalar((.046 + i * .002) * pulse);
      } else if (p && !last && i > 0 && points[i - 1]) {
        const prev = points[i - 1]; last = new THREE.Vector3(prev.x, prev.y, prev.z);
      }
    }
    this.reticle.visible = state.isAiming;
    if (state.isAiming) {
      // Ground marker is an aiming reference, not a collision prediction.
      const projected = points.find(p => p.z <= 0) || points[points.length - 1];
      if (projected) this.reticle.position.set(projected.x, .08, Math.max(-this.level!.platform.depth / 2, Math.min(this.level!.platform.depth / 2, projected.z)));
      this.reticle.scale.setScalar(state.dragging ? 1.13 : 1);
      this.reticle.rotation.y = state.reducedMotion ? 0 : this.elapsed * .12;
    }
  }

  fireFeedback() {
    if (this.disposed) return;
    this.recoil = 1;
    if (!this.reducedMotion) this.shake = Math.max(this.shake, .095);
  }

  impactFeedback(event: PhysicsEvent) {
    if (this.disposed) return;
    const splash = event.type === 'splash';
    if (splash) {
      const ripple = this.ripples.find(r => r.life <= 0) || this.ripples[0];
      ripple.life = ripple.duration = this.reducedMotion ? .45 : 1.1;
      ripple.mesh.position.set(event.position.x, SEA_Y + .025, event.position.z);
      ripple.mesh.visible = true;
    }
    const count = this.reducedMotion ? 3 : splash ? 8 : 5;
    let used = 0;
    for (const particle of this.particles) {
      if (particle.life > 0) continue;
      const angle = used * 2.4 + this.elapsed * 7;
      const speed = Math.min(3, .8 + event.strength * .12);
      particle.mesh.position.set(event.position.x, splash ? SEA_Y + .08 : event.position.y, event.position.z);
      particle.velocity.set(Math.sin(angle) * speed, splash ? 2.6 : 1.5, Math.cos(angle) * speed);
      particle.duration = particle.life = this.reducedMotion ? .2 : .6 + (used % 3) * .1;
      particle.size = splash ? .075 : .06;
      particle.mesh.visible = true;
      if (++used >= count) break;
    }
    if (!this.reducedMotion && !splash) this.shake = Math.max(this.shake, Math.min(.12, event.strength * .008));
  }

  private updateEffects(delta: number, reducedMotion: boolean) {
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life = Math.max(0, particle.life - delta);
      if (!reducedMotion) {
        particle.velocity.y -= delta * 6;
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.mesh.rotation.x += delta * 3;
      }
      particle.mesh.scale.setScalar(particle.size * particle.life / particle.duration);
      particle.mesh.visible = particle.life > 0;
    }
    for (const ripple of this.ripples) {
      if (ripple.life <= 0) continue;
      ripple.life = Math.max(0, ripple.life - delta);
      const progress = 1 - ripple.life / ripple.duration;
      ripple.mesh.scale.setScalar(reducedMotion ? .5 : .28 + progress * 1.45);
      ripple.mesh.material.opacity = (1 - progress) * .65;
      ripple.mesh.visible = ripple.life > 0;
    }
  }

  resize() {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
    if (this.level) {
      const frame = calculateViewFrame(this.level, width / height);
      this.camera.left = -frame.halfWidth; this.camera.right = frame.halfWidth;
      this.camera.top = frame.halfHeight; this.camera.bottom = -frame.halfHeight;
      this.baseCamera.copy(frame.position); this.targetCamera.copy(frame.target);
      this.camera.position.copy(frame.position); this.camera.lookAt(frame.target);
    }
    this.camera.updateProjectionMatrix();
  }

  diagnostics() {
    return {
      disposed: this.disposed, contextLost: this.contextLost,
      blockMeshes: this.meshes.size, visibleBlocks: [...this.meshes.values()].filter(m => m.visible).length,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      activeParticles: this.particles.filter(p => p.life > 0).length,
      activeRipples: this.ripples.filter(r => r.life > 0).length,
      pixelRatio: this.renderer.getPixelRatio(),
      ownedGeometries: this.geometries.size, ownedMaterials: this.materials.size,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.scene.clear(); this.meshes.clear();
    this.sunlight.shadow.dispose();
    for (const particle of this.particles) { particle.life = 0; particle.mesh.visible = false; }
    for (const ripple of this.ripples) { ripple.life = 0; ripple.mesh.visible = false; }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear(); this.materials.clear(); this.colorMaterials.clear();
    this.renderer.renderLists.dispose(); this.renderer.dispose();
    // Release the underlying GL allocation as well as the Three.js object caches.
    this.renderer.forceContextLoss();
  }
}
