import type { Aim } from './types';
interface Tool { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute(input: unknown): unknown }
interface ModelContext { registerTool(tool: Tool, options: { signal: AbortSignal }): void | Promise<void> }
interface GameActions { inspect(): unknown; start(id: number): void; aim(aim: Aim): void; fire(): void }
export function registerGameTools(actions: GameActions): () => void {
 const context = (document as Document & { modelContext?: ModelContext }).modelContext;
 if (!context?.registerTool) return () => {};
 const lifecycle = new AbortController();
 const object = (input: unknown): Record<string, unknown> => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须为对象。');
  return input as Record<string, unknown>;
 };
 const tools: Tool[] = [
  { name: 'read_game_state', title: '读取游戏状态', description: '读取关卡、弹药、瞄准和真实物理状态，不改变游戏。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => actions.inspect() },
  { name: 'start_unlocked_level', title: '开始已解锁关卡', description: '开始或重玩指定的已解锁关卡。', inputSchema: { type: 'object', properties: { level: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['level'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { const p = object(input); if (!Number.isInteger(p.level) || Object.keys(p).some(k => k !== 'level')) throw new Error('请输入有效关卡。'); actions.start(p.level as number); return actions.inspect(); } },
  { name: 'aim_cannon', title: '调整炮口', description: '以弧度设置水平和俯仰角，只调整瞄准，不发射。', inputSchema: { type: 'object', properties: { yaw: { type: 'number' }, pitch: { type: 'number' } }, required: ['yaw','pitch'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { const p = object(input); if (typeof p.yaw !== 'number' || typeof p.pitch !== 'number' || !Number.isFinite(p.yaw) || !Number.isFinite(p.pitch) || Object.keys(p).some(k => k !== 'yaw' && k !== 'pitch')) throw new Error('瞄准角必须是有限数值。'); actions.aim({ yaw: p.yaw, pitch: p.pitch }); return actions.inspect(); } },
  { name: 'fire_cannon', title: '发射炮弹', description: '消耗一发炮弹并启动真实物理模拟，只能在瞄准阶段发射。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { if (Object.keys(object(input)).length) throw new Error('发射无需参数。'); actions.fire(); return actions.inspect(); } },
 ];
 for (const tool of tools) {
  try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability. */ }
 }
 return () => lifecycle.abort();
}
