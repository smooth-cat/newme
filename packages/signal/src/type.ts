import { Line } from './line';
import type { Signal } from './signal';

export type Task = () => any;

export type CreateTaskProps<T> = {
  callbackAble: (fn: Function) => any;
  aIsUrgent: (a: Task & T, b: Task & T) => boolean;
};
export type ScheduleHandler = (effects: Signal[]) => any;
export type SignalOpt<T> = {
  customPull?: () => T;
  scheduler?: string;
  isScope?: boolean;
};

export type Vertex = {
  /** 上游来的最后一条线 */
  recEnd: Line;
  recStart: Line;
  /** 向下游发出的最后一条线 */
  emitEnd: Line;
  emitStart: Line;
};

export type DFSCtxBegin = {
  node: Signal;
  lineFromUp: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

export type DFSCtxCompete = {
  node: Signal;
  lineToDeep: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

export type Getter<T = any> = {
  (): T;
  ins?: Signal;
};

export type Mix<T = any> = {
  (v: T): void;
  (): T;
  v: T;
  stop(): void;
};


export type ValueDiff = {
  old: any;
  val: any;
}