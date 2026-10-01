import { describe, expect, it } from 'vitest';
import { ProgressStore } from '../src/storage';
const defaults = { version: 1, unlocked: 1, stars: Array(8).fill(0), muted: false };
function memory(value: string | null = null): Storage {
  const values = new Map<string,string>(value === null ? [] : [['tidal-tower:v1', value]]);
  return { get length() {return values.size}, clear:()=>values.clear(), key:i=>[...values.keys()][i] ?? null, getItem:k=>values.get(k) ?? null, setItem:(k,v)=>{values.set(k,v)}, removeItem:k=>{values.delete(k)} };
}
describe('ProgressStore', () => {
  it('uses independent default arrays and defensive read copies', () => {
    const store = new ProgressStore(memory()); const copy = store.read(); copy.stars[0] = 3; copy.unlocked = 8;
    expect(store.read()).toEqual(defaults);
  });
  it.each(['{', JSON.stringify({...defaults,version:2}), JSON.stringify({...defaults,unlocked:9}), JSON.stringify({...defaults,stars:[3]}), JSON.stringify({...defaults,stars:[0,0,0,0,0,0,0,4]}), JSON.stringify({...defaults,muted:'false'}), JSON.stringify({...defaults,extra:true})])('rejects invalid stored data %s', raw => {
    expect(new ProgressStore(memory(raw)).read()).toEqual(defaults);
  });
  it('loads valid progress, improves stars and unlocks monotonically through level eight', () => {
    const storage=memory(JSON.stringify({...defaults,unlocked:3,stars:[3,1,0,0,0,0,0,0]})); const store=new ProgressStore(storage);
    store.completeLevel(1,1); expect(store.read().stars[0]).toBe(3); expect(store.read().unlocked).toBe(3);
    store.completeLevel(3,2); store.completeLevel(8,3); store.setMuted(true);
    expect(new ProgressStore(storage).read()).toEqual({version:1,unlocked:8,stars:[3,1,2,0,0,0,0,3],muted:true});
  });
  it('ignores invalid completion ids and star counts', () => {
    const store=new ProgressStore(memory()); for(const [id,stars] of [[0,3],[9,3],[1.5,3],[1,0],[1,4],[1,NaN]]) store.completeLevel(id,stars);
    expect(store.read()).toEqual(defaults);
  });
  it('safely handles a throwing default localStorage getter', () => {
    const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('restricted')}});
    try { const store=new ProgressStore(); store.completeLevel(1,2); expect(store.unavailable).toBe(true); expect(store.read().stars[0]).toBe(2); }
    finally { if(original) Object.defineProperty(globalThis,'localStorage',original); else Reflect.deleteProperty(globalThis,'localStorage'); }
  });
  it('retains session progress when storage is absent or throws on read/write', () => {
    for(const storage of [null, {...memory(),getItem:()=>{throw Error('denied')}}, {...memory(),setItem:()=>{throw Error('quota')}}]) {
      const store=new ProgressStore(storage); store.completeLevel(1,3); store.setMuted(true);
      expect(store.unavailable).toBe(true); expect(store.read()).toEqual({...defaults,unlocked:2,stars:[3,0,0,0,0,0,0,0],muted:true});
    }
  });
});
