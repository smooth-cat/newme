import { SortMap } from '../../shared/util';
import type { Signal } from './signal';
import { BaseEvent as Event } from '../../shared/event';

export const evt = new Event();

export const G = {
  /** 原子 signal 更新次数 */
  version: 0,
  id: 0,
  /** scope 销毁任务序号 */
  scopeDisposeI: 0,
  parentScope: null as Signal | null,
  currentScope: null as Signal | null
};

export const dirtyLeafs = new SortMap<Signal>();

export enum State {
  Clean = 0,
  SelfStopped = 0b0000_0000_0000_0000_0000_0001_0000_0000,
  IsScope = 0b0000_0000_0000_0000_0000_0000_1000_0000,
  /** 仅用于 scope 节点是否 abort */
  ScopeAborted = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  ScopeAbort = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  OutLink = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Unknown = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Dirty = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  Check = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  ScopeReady = 0b0000_0000_0000_0000_0000_0000_0000_0001
}

export const DirtyState = State.Unknown | State.Dirty;
export const ScopeExecuted =  State.ScopeReady | State.ScopeAbort | State.ScopeAborted;
export const ScopeAbort = State.ScopeAbort | State.ScopeAborted;
