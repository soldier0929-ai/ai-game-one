// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { registerGameTools } from '../src/webmcp';

afterEach(() => { delete (document as any).modelContext; });
describe('optional browser game tools', () => {
 it('is harmless when browser has no WebMCP', () => {
  expect(() => registerGameTools({inspect:()=>({}),start:()=>{},aim:()=>{},fire:()=>{}})()).not.toThrow();
 });
 it('registers distinct real actions and rejects invalid mutation arguments', () => {
  const registered = new Map<string,any>(); let shotCount=0; let started=0; let angle={yaw:0,pitch:0}; let signal:AbortSignal|undefined;
  (document as any).modelContext = {registerTool: (tool:any, options:any) => { registered.set(tool.name,tool); signal=options.signal; }};
  const stop = registerGameTools({inspect:()=>({shots:shotCount,started,angle}),start:id=>{started=id;},aim:aim=>{angle=aim;},fire:()=>{shotCount++;}});
  expect([...registered.keys()]).toEqual(['read_game_state','start_unlocked_level','aim_cannon','fire_cannon']);
  expect(registered.get('read_game_state').annotations.readOnlyHint).toBe(true);
  expect(()=>registered.get('aim_cannon').execute({yaw:NaN,pitch:.1})).toThrow();
  expect(()=>registered.get('start_unlocked_level').execute({level:'1'})).toThrow();
  expect(()=>registered.get('fire_cannon').execute({forceWin:true})).toThrow();
  expect(shotCount).toBe(0); expect(started).toBe(0);
  registered.get('start_unlocked_level').execute({level:1}); registered.get('aim_cannon').execute({yaw:.1,pitch:.2});
  expect(registered.get('fire_cannon').execute({})).toEqual({shots:1,started:1,angle:{yaw:.1,pitch:.2}});
  stop(); expect(signal?.aborted).toBe(true);
 });
});
