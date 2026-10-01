import { readFileSync, writeFileSync } from 'node:fs';
import { GameSession } from '../src/game';
import { LEVELS } from '../src/levels';
import { initializePhysics, Simulation } from '../src/simulation';
import type { Aim, LevelDefinition } from '../src/types';

interface Solution { level: number; title: string; target: number; score: number; shots: Aim[]; scores: number[]; initialSteps: number; shotSteps: number[]; maxStepsPerShot: number }
const solutionPath = new URL('../tests/level-solutions.json', import.meta.url);
const warmupArgument = process.argv.find(argument => argument.startsWith('--warmup-steps='));
const INITIAL_STEPS = warmupArgument ? Number(warmupArgument.split('=')[1]) : 120;
if (!Number.isInteger(INITIAL_STEPS) || INITIAL_STEPS < 0) throw new Error('Invalid warmup step count');
const MAX_STEPS = 360;
await initializePhysics();

function replay(level: LevelDefinition, shots: Aim[]): {scores: number[]; shotSteps: number[]; won: boolean} {
  const simulation = new Simulation(level);
  const game = new GameSession(level.blocks.length, level.ammo);
  for (let frame = 0; frame < INITIAL_STEPS; frame++) simulation.step();
  const scores: number[] = [], shotSteps: number[] = [];
  for (const shot of shots) {
    if (!simulation.fire(shot) || !game.fire()) throw new Error(`Illegal replay shot on level ${level.id}`);
    let frame = 0;
    while (game.phase === 'settling' && frame <= MAX_STEPS) {
      simulation.step();
      const snapshot = simulation.snapshot();
      game.step(1 / 60, snapshot.fallenIds.length, snapshot.settled);
      frame++;
    }
    simulation.retireProjectile();
    scores.push(game.fallen);
    shotSteps.push(frame);
  }
  simulation.dispose();
  return {scores, shotSteps, won: game.phase === 'won'};
}

if (process.argv.includes('--replay')) {
  const solutions: Solution[] = JSON.parse(readFileSync(solutionPath, 'utf8'));
  if (solutions.length !== LEVELS.length) throw new Error('Not all levels have a solution');
  for (const solution of solutions) {
    const level = LEVELS.find(entry => entry.id === solution.level)!;
    if (!level || solution.shots.length > level.ammo) throw new Error('Invalid solution level/ammo');
    const result = replay(level, solution.shots);
    const score = result.scores.at(-1) ?? 0;
    if (!result.won) throw new Error(`Level ${level.id}: ${score} below target`);
    console.log(`PASS level ${level.id}: ${score}/${level.blocks.length}, ${solution.shots.length}/${level.ammo} shots, scores ${result.scores.join(',')}, frames ${result.shotSteps.join(',')}`);
  }
} else {
  const solutions: Solution[] = [];
  const candidates = [-.20, -.16, -.13, -.10, -.07, -.035, 0, .035, .07, .10, .13, .16, .20].flatMap(yaw => [.04, .08, .14, .22].map(pitch => ({yaw, pitch})));
  for (const level of LEVELS) {
    const shots: Aim[] = [];
    let result = {scores: [] as number[], shotSteps: [] as number[], won: false};
    const target = Math.ceil(level.blocks.length * .8);
    for (let attempt = 0; attempt < level.ammo && !result.won; attempt++) {
      let bestScore = result.scores.at(-1) ?? -1;
      let bestShot = candidates[0];
      let bestResult: typeof result | undefined;
      for (const candidate of candidates) {
        const candidateResult = replay(level, [...shots, candidate]);
        const score = candidateResult.scores.at(-1)!;
        if (score > bestScore) { bestScore = score; bestShot = candidate; bestResult = candidateResult; }
        if (candidateResult.won) break;
      }
      if (!bestResult) break;
      shots.push(bestShot);
      result = bestResult;
      console.log(`Level ${level.id}, shot ${shots.length}: ${JSON.stringify(bestShot)} -> ${bestScore}/${level.blocks.length}`);
    }
    const score = result.scores.at(-1) ?? 0;
    solutions.push({level: level.id, title: level.title, target, score, shots, scores: result.scores, initialSteps: INITIAL_STEPS, shotSteps: result.shotSteps, maxStepsPerShot: MAX_STEPS});
    writeFileSync(solutionPath, JSON.stringify(solutions, null, 2) + '\n');
    if (!result.won) throw new Error(`Unsolved level ${level.id}: ${score}/${target}`);
  }
}
