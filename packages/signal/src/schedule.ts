import { Queue, QueueItem, SubQueue } from 'bobe-shared';
import type { Signal } from './signal';
import { TaskQueue } from './task';
import { Task } from './type';
import { macro, micro } from './util';

export abstract class Scheduler {
  static Sync = '__Sync_';
  static Layout = '__Layout_';
  static Micro = '__Micro_';
  static Macro = '__Macro_';

  effectQueue: Queue<Signal> = new Queue();
  /** 每当 Set 或 BatchSet 开始时标记 */
  firstEffectItem: QueueItem<Signal> = null;
  /** 记录 Set 或 BatchSet 产生的最后一个 Effect */
  lastEffectItem: QueueItem<Signal> = null;

  endSet() {
    if(!this.firstEffectItem) return;
    const subQueue = this.effectQueue.subRef(this.firstEffectItem, this.lastEffectItem);
    this.onOneSetEffectsAdded?.(subQueue, this.effectQueue)
    this.firstEffectItem = null;
    this.lastEffectItem = null;
  }

  addEffect(effect: Signal) {
    const item = this.effectQueue.push(effect);
    this.onEffectAdded?.(effect, item, this.effectQueue);
    return item;
  }

  /**
   * 用户可实现
   * 一个 effect 加入队列后的 回调
   *  */
  // @ts-ignore
  onEffectAdded(effect: Signal, item: QueueItem<Signal>, queue: Queue<Signal>): void;

  /**
   * 用户可实现
   * 一次 set 操作导致的所有 effect 加入队列后的 回调
   * */
  // @ts-ignore
  onOneSetEffectsAdded(subQueue: SubQueue<Signal>, queue: Queue<Signal>): void;
}

class SyncScheduler extends Scheduler {
  onOneSetEffectsAdded(subQueue: Queue<Signal>, queue: Queue<Signal>): void {
    subQueue.forEach((effect, item) => {
      // 循环依赖时会跳过已经在执行的 effect
      effect.runIfDirty();
      queue.delete(item);
    });
  }
}

class MicroScheduler extends Scheduler {
  taskQueue = TaskQueue.create({ callbackAble: micro, aIsUrgent: (a, b) => a.time < b.time });
  onOneSetEffectsAdded(subQueue: Queue<Signal>, queue: Queue<Signal>): void {
    const task: Task = () => {
      subQueue.forEach((effect, item) => {
        // 循环依赖时会跳过已经在执行的 effect
        effect.runIfDirty();
        queue.delete(item);
      });
      return {
        finished: true,
        startNewCallbackAble: false
      };
    };
    task.time = Date.now();
    this.taskQueue.pushTask(task);
  }
}

class MacroScheduler extends Scheduler {
  taskQueue = TaskQueue.create({ callbackAble: macro, aIsUrgent: (a, b) => a.time < b.time });
  onOneSetEffectsAdded(subQueue: Queue<Signal>, queue: Queue<Signal>): void {
    const task = () => {
      subQueue.forEach((effect, item) => {
        // 循环依赖时会跳过已经在执行的 effect
        effect.runIfDirty();
        queue.delete(item);
      });
    };
    task.time = Date.now();
    this.taskQueue.pushTask(task);
  }
}

class LayoutScheduler extends Scheduler {
  taskQueue = TaskQueue.create({ callbackAble: macro, aIsUrgent: (a, b) => a.time < b.time });
  onOneSetEffectsAdded(subQueue: Queue<Signal>, queue: Queue<Signal>): void {
    const task = () => {
      subQueue.forEach((effect, item) => {
        // 循环依赖时会跳过已经在执行的 effect
        effect.runIfDirty();
        queue.delete(item);
      });
    };
    task.time = Date.now();
    this.taskQueue.pushTask(task);
  }
}

export const _scheduler: Record<string | symbol, Scheduler> = {
  [Scheduler.Sync]: new SyncScheduler(),
  [Scheduler.Micro]: new MicroScheduler(),
  [Scheduler.Macro]: new MacroScheduler(),
  [Scheduler.Layout]: new LayoutScheduler()
};
export const registerScheduler = (key: string | symbol, Ctor: new () => Scheduler) => (_scheduler[key] = new Ctor());
