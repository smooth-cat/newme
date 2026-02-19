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
  PullingSignal: null as Signal | null
};

export const dirtyLeafs = new SortMap<Signal>();

export enum State {
  Clean = 0,
  /** watch 节点执行 watcher 时只连接 scope */
  LinkScopeOnly = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  /** 仅用于 scope 节点是否 abort */
  ScopeAbort = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  /** 仅用于 scope 节点是否 ready */
  ScopeReady = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  /** 当前节点是 scope 节点 */
  IsScope = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  /** 当前节点可能变化 */
  Unknown = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  /** 当前节点有变化 */
  Dirty = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  /** 当前节点正在进行 pull 预检处理 */
  Check = 0b0000_0000_0000_0000_0000_0000_0000_0001
}

export const DirtyState = State.Unknown | State.Dirty;
export const ScopeExecuted = State.ScopeReady | State.ScopeAbort;
export const ScopeAbort = State.ScopeAbort;
