import type { Signal } from './signal';
import { TaskQueue } from './task';
import { ScheduleHandler } from './type';
import { macro, micro } from './util';

export enum Scheduler {
  Sync = '__Sync_',
  Layout = '__Layout_',
  Micro = '__Micro_',
  Macro = '__Macro_'
}

export const _scheduler: Record<string | symbol, ScheduleHandler> = {
  [Scheduler.Sync]: defaultScheduler,
  [Scheduler.Micro]: microScheduler,
  [Scheduler.Macro]: macroScheduler,
  [Scheduler.Layout]: layoutScheduler
};
export const scheduler = (key: string | symbol, value: ScheduleHandler) => (_scheduler[key] = value);

function defaultScheduler(effects: Signal[]) {
  for (const effect of effects) {
    effect.runIfDirty();
  }
}

let microSTaskQueue: TaskQueue<{ time: number }>;
let macroSTaskQueue: TaskQueue<{ time: number }>;
let layoutSTaskQueue: TaskQueue<{ time: number }>;
function microScheduler(effects: Signal[]) {
  microSTaskQueue = microSTaskQueue || TaskQueue.create({ callbackAble: micro, aIsUrgent: (a, b) => a.time < b.time });
  microSTaskQueue.pushTask(defaultScheduler.bind(null, effects));
}

function macroScheduler(effects: Signal[]) {
  macroSTaskQueue = macroSTaskQueue || TaskQueue.create({ callbackAble: macro, aIsUrgent: (a, b) => a.time < b.time });
  macroSTaskQueue.pushTask(defaultScheduler.bind(null, effects));
}
function layoutScheduler(effects: Signal[]) {
  layoutSTaskQueue =
    layoutSTaskQueue || TaskQueue.create({ callbackAble: macro, aIsUrgent: (a, b) => a.time < b.time });
  layoutSTaskQueue.pushTask(defaultScheduler.bind(null, effects));
}
