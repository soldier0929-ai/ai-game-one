import type { BlockDefinition, LevelDefinition, Vec3 } from './types';

const CORAL = ['#ec886f', '#fff0d9', '#f4c362'];
const TEAL = ['#54b4a3', '#fff0d9', '#f4c362'];
const GOLD = ['#f4c362', '#fff0d9', '#ec886f'];
const BLUE = ['#7dadd6', '#fff0d9', '#ec886f'];

/** Every brick is a free rigid body, including the beams spanning the supports. */
function buildLevel(id: number, title: string, hint: string, ammo: number, width: number, depth: number,
  palette: string[], layout: (grid: (columns: number, rows: number, layers: number, origin?: Vec3, size?: Vec3) => void, add: (position: Vec3, size: Vec3) => void) => void): LevelDefinition {
  const blocks: BlockDefinition[] = [];
  const add = (position: Vec3, size: Vec3) => {
    blocks.push({id: `level-${id}-brick-${blocks.length}`, position, size, color: palette[Math.floor(blocks.length / 2) % palette.length], density: 1.2});
  };
  const grid = (columns: number, rows: number, layers: number, origin: Vec3 = {x: 0, y: 0, z: 0}, size: Vec3 = {x: .72, y: .52, z: .72}) => {
    for (let layer = 0; layer < layers; layer++) for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      add({x: origin.x + (column - (columns - 1) / 2) * (size.x + .02), y: origin.y + size.y / 2 + layer * size.y, z: origin.z + (row - (rows - 1) / 2) * (size.z + .02)}, {...size});
    }
  };
  layout(grid, add);
  return {id, title, hint, ammo, blocks, platform: {width, depth, height: 2.4}, cannon: {x: 0, y: .8, z: 10}, defaultAim: {yaw: 0, pitch: .08}};
}

export const LEVELS: LevelDefinition[] = [
  buildLevel(1, '泡泡码头', '瞄准塔底，让上层积木失去支撑。', 3, 3.4, 2.7, CORAL, grid => {
    grid(3, 2, 3); // 18: compact low tower
  }),
  buildLevel(2, '三色方塔', '高塔容易摇晃，试着击中下层的一角。', 3, 2.7, 2.2, TEAL, grid => {
    grid(2, 2, 6); // 24: narrow, tall tower
  }),
  buildLevel(3, '双塔连桥', '先击中桥下的塔脚，观察横梁的连锁反应。', 4, 4.5, 2.2, GOLD, (grid, add) => {
    grid(2, 2, 3, {x: -1.2, y: 0, z: 0});
    grid(2, 2, 3, {x: 1.2, y: 0, z: 0});
    for (const z of [-.37, .37]) {
      add({x: -1.12, y: 1.82, z}, {x: 1.04, y: .52, z: .72});
      add({x: 0, y: 1.82, z}, {x: 1.2, y: .52, z: .72});
      add({x: 1.12, y: 1.82, z}, {x: 1.04, y: .52, z: .72});
    } // 24 tower bricks + 6 genuinely supported bridge bricks
  }),
  buildLevel(4, '斜撑仓库', '四根支柱撑着屋顶，先拆掉一侧的承重柱。', 4, 4.1, 2.2, BLUE, (grid, add) => {
    for (const x of [-1.3, 1.3]) for (const z of [-.37, .37]) {
      grid(1, 1, 6, {x, y: 0, z}, {x: .62, y: .52, z: .62});
    }
    for (const z of [-.37, .37]) add({x: 0, y: 3.3, z}, {x: 3.22, y: .36, z: .62});
    grid(3, 2, 1, {x: 0, y: 3.48, z: 0}, {x: .92, y: .52, z: .72}); // 24 supports + 2 beams + 6 roof bricks
  }),
  buildLevel(5, '海风阶梯', '从低处到高处，逐区清理阶梯。', 4, 3.7, 2.2, TEAL, grid => {
    [2, 4, 5, 7].forEach((height, column) => grid(1, 2, height, {x: (column - 1.5) * .74, y: 0, z: 0})); // 36
  }),
  buildLevel(6, '厚墙货栈', '宽城墙需要分区瞄准，把后排也推入海中。', 5, 4.1, 1.95, CORAL, grid => {
    grid(7, 3, 2, {x: 0, y: 0, z: 0}, {x: .53, y: .48, z: .53}); // 42: broad, three-row low wall
  }),
  buildLevel(7, '三塔联阵', '三座塔分散在平台上，为每一座留出炮弹。', 5, 4.5, 1.85, BLUE, grid => {
    for (const x of [-1.4, 0, 1.4]) grid(2, 2, 4, {x, y: 0, z: 0}, {x: .53, y: .52, z: .53}); // 48
  }),
  buildLevel(8, '灯塔嘉年华', '先攻中央高塔，再清理两侧的小塔。', 5, 4.8, 2.3, GOLD, grid => {
    grid(2, 2, 7, {x: 0, y: 0, z: -.12}, {x: .58, y: .52, z: .58});
    grid(2, 2, 4, {x: -1.55, y: 0, z: .2}, {x: .62, y: .48, z: .62});
    grid(2, 2, 4, {x: 1.55, y: 0, z: -.15}, {x: .62, y: .48, z: .62}); // 28 + 16 + 16
  }),
];
