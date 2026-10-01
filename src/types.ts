export interface Vec3 { x: number; y: number; z: number }
export interface Quaternion { x: number; y: number; z: number; w: number }
/** Angles are radians. Positive yaw aims right; positive pitch aims upward. */
export interface Aim { yaw: number; pitch: number }
export interface BlockDefinition { id: string; position: Vec3; size: Vec3; color: string; rotation?: Vec3; density?: number }
export interface LevelDefinition { id: number; title: string; hint: string; ammo: number; blocks: BlockDefinition[]; platform: { width: number; depth: number; height: number }; cannon: Vec3; defaultAim: Aim }
export interface BodyPose { id: string; position: Vec3; rotation: Quaternion }
export interface PhysicsSnapshot { blocks: BodyPose[]; projectile: BodyPose | null; fallenIds: string[]; bodyCount: number; settled: boolean }
export interface PhysicsEvent { type: 'impact' | 'splash'; position: Vec3; strength: number }
export type Screen = 'loading' | 'home' | 'levels' | 'playing' | 'paused' | 'won' | 'lost' | 'error' | 'tutorial';
export interface GameViewModel { screen: Screen; phase: 'aiming' | 'settling'; currentLevel: number; levelName: string; levelHint: string; ammo: number; maxAmmo: number; fallen: number; total: number; target: number; stars: number; bestStars: number[]; unlocked: number; muted: boolean; storageWarning: boolean; settlingSeconds: number; error: string; dragging: boolean }
export type UIAction = { type: 'start' | 'levels' | 'back' | 'resume' | 'restart' | 'next' | 'mute' | 'help' | 'tutorial-done' | 'retry' | 'pause' } | { type: 'level'; id: number };
export interface RendererState { isAiming: boolean; dragging: boolean; reducedMotion: boolean; previousSnapshot?: PhysicsSnapshot; interpolationAlpha?: number }
