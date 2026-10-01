// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AimInput } from '../src/input';
import { MAX_PITCH, MAX_YAW, MIN_PITCH } from '../src/trajectory';
import type { Aim } from '../src/types';
const cleanups: (()=>void)[]=[];
afterEach(()=>{cleanups.splice(0).forEach(fn=>fn());document.body.innerHTML='';});
function setup(width=400) {
 const canvas=document.createElement('canvas'); document.body.append(canvas);
 canvas.getBoundingClientRect=()=>({width,height:600,left:0,top:0,right:width,bottom:600,x:0,y:0,toJSON:()=>({})});
 const captured=new Set<number>(); canvas.setPointerCapture=id=>{captured.add(id)}; canvas.hasPointerCapture=id=>captured.has(id); canvas.releasePointerCapture=id=>{captured.delete(id)};
 let aim:Aim={yaw:0,pitch:.2}; let enabled=true;
 const fire=vi.fn(), pause=vi.fn(),gesture=vi.fn(),dragging=vi.fn();
 const input=new AimInput(canvas,{getAim:()=>aim,setAim:value=>{aim=value},canAim:()=>enabled,fire,onPause:pause,onGesture:gesture,onDragging:dragging}); cleanups.push(()=>input.dispose());
 return {canvas,input,fire,pause,gesture,dragging,aim:()=>aim,disable:()=>{enabled=false},captured};
}
function pointer(target:EventTarget,type:string,id=1,x=100,y=100,primary=true) {const e=new Event(type,{bubbles:true,cancelable:true}); Object.assign(e,{pointerId:id,clientX:x,clientY:y,isPrimary:primary,button:0}); target.dispatchEvent(e);return e;}
function key(target:EventTarget,key:string,repeat=false) {const e=new KeyboardEvent('keydown',{key,repeat,bubbles:true,cancelable:true});target.dispatchEvent(e);return e;}
describe('AimInput',()=>{
 it('drags right and up from the initial aim with responsive width normalization',()=>{
  const a=setup(400),b=setup(800); pointer(a.canvas,'pointerdown');pointer(a.canvas,'pointermove',1,140,80);pointer(b.canvas,'pointerdown');pointer(b.canvas,'pointermove',1,180,60);
  expect(a.aim().yaw).toBeGreaterThan(0);expect(a.aim().pitch).toBeGreaterThan(.2);expect(a.aim()).toEqual(b.aim());
 });
 it('limits pointer and keyboard aiming to shared trajectory bounds',()=>{
  const s=setup();pointer(s.canvas,'pointerdown');pointer(s.canvas,'pointermove',1,10000,-10000);expect(s.aim()).toEqual({yaw:MAX_YAW,pitch:MAX_PITCH});
  pointer(s.canvas,'pointermove',1,-10000,10000);expect(s.aim()).toEqual({yaw:-MAX_YAW,pitch:MIN_PITCH});s.input.cancel();key(document,'ArrowDown');key(document,'ArrowLeft');expect(s.aim()).toEqual({yaw:-MAX_YAW,pitch:MIN_PITCH});
 });
 it('ignores cancellation from another pointer and movement after cancellation',()=>{const s=setup();pointer(s.canvas,'pointerdown');pointer(s.canvas,'pointercancel',2);expect(s.captured.has(1)).toBe(true);s.input.cancel();pointer(s.canvas,'pointermove',1,180,20);expect(s.aim()).toEqual({yaw:0,pitch:.2});});
 it('captures only the primary pointer and fires once for its matching release',()=>{
  const s=setup();pointer(s.canvas,'pointerdown',2,100,100,false);expect(s.captured.size).toBe(0);
  pointer(s.canvas,'pointerdown');pointer(s.canvas,'pointerdown',2);pointer(s.canvas,'pointerup',2);expect(s.fire).not.toHaveBeenCalled();
  pointer(s.canvas,'pointerup');pointer(s.canvas,'pointerup');expect(s.fire).toHaveBeenCalledTimes(1);expect(s.captured.size).toBe(0);expect(s.dragging).toHaveBeenLastCalledWith(false);
 });
 it.each(['pointercancel','lostpointercapture','resize','hidden','cancel'])('cancels %s without a shot',type=>{
  const s=setup();pointer(s.canvas,'pointerdown');
  if(type==='resize')window.dispatchEvent(new Event('resize'));else if(type==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});}else if(type==='cancel')s.input.cancel();else pointer(s.canvas,type);
  pointer(s.canvas,'pointerup');expect(s.fire).not.toHaveBeenCalled();expect(s.captured.size).toBe(0);
 });
 it('does not fire when aiming becomes unavailable during a drag',()=>{const s=setup();pointer(s.canvas,'pointerdown');s.disable();pointer(s.canvas,'pointerup');expect(s.fire).not.toHaveBeenCalled();});
 it('aims with arrows and fires on nonrepeated space; Esc pauses',()=>{
  const s=setup();expect(key(document,'ArrowRight').defaultPrevented).toBe(true);expect(s.aim().yaw).toBeGreaterThan(0);key(document,' ');key(document,' ',true);expect(s.fire).toHaveBeenCalledTimes(1);key(document,'Escape');expect(s.pause).toHaveBeenCalledTimes(1);
 });
 it('handles Escape from a focused button while preserving native Space and arrows',()=>{
  const s=setup();const button=document.createElement('button');document.body.append(button);button.focus();
  expect(document.activeElement).toBe(button);expect(key(button,' ').defaultPrevented).toBe(false);expect(key(button,'ArrowRight').defaultPrevented).toBe(false);
  expect(s.fire).not.toHaveBeenCalled();expect(s.aim().yaw).toBe(0);
  pointer(s.canvas,'pointerdown');key(button,'Escape');key(button,'Escape',true);
  expect(s.pause).toHaveBeenCalledTimes(1);expect(s.captured.size).toBe(0);pointer(s.canvas,'pointerup');expect(s.fire).not.toHaveBeenCalled();
  s.disable();key(button,'Escape');expect(s.pause).toHaveBeenCalledTimes(2);
 });
 it('ignores gameplay keys on controls and allows page scrolling when unavailable',()=>{
  const s=setup();for(const tag of ['input','textarea','select','button']){const el=document.createElement(tag);document.body.append(el);expect(key(el,' ').defaultPrevented).toBe(false);key(el,'ArrowRight');}
  expect(s.fire).not.toHaveBeenCalled();expect(s.aim().yaw).toBe(0);s.disable();expect(key(document,'ArrowDown').defaultPrevented).toBe(false);expect(pointer(s.canvas,'pointerdown').defaultPrevented).toBe(false);
 });
 it('removes listeners and clears active capture on disposal',()=>{const s=setup();pointer(s.canvas,'pointerdown');s.input.dispose();pointer(s.canvas,'pointerup');key(document,' ');key(document,'Escape');expect(s.fire).not.toHaveBeenCalled();expect(s.pause).not.toHaveBeenCalled();expect(s.captured.size).toBe(0);});
});
