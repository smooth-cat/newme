import { SortMap } from '../../shared/util';
import type { Signal } from './signal';
import { BaseEvent as Event } from '../../shared/event';

export const evt = new Event();

export const G = {
  /** 原子 signal 更新次数 */
  version: 0,
  id: 0,
  /** scope 销毁任务序号 */
  scopeDisposeI: 0
};

export const dirtyLeafs = new SortMap<Signal>();

export enum State {
  Clean = 0b0000,
  /** 仅用于 scope 节点是否 abort */
  ScopeAborted = 0b1000000,
  ScopeAbort = 0b0100000,
  OutLink = 0b0010000,
  Unknown = 0b0001000,
  Dirty = 0b0000100,
  Check = 0b0000010,
  ScopeReady = 0b0000001
}

export const DirtyState = State.Unknown | State.Dirty;
export const ScopeExecuted = State.ScopeReady | State.ScopeAbort | State.ScopeAborted;
