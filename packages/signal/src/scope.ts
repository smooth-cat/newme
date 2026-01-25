import { Queue } from '../../shared/util';
export const ide =
  globalThis.requestIdleCallback ||
  (globalThis.requestAnimationFrame
    ? (fn: Function) =>
        globalThis.requestAnimationFrame(() => {
          setTimeout(() => {
            fn();
          });
        })
    : globalThis.setTimeout);

export class IdeScheduler {
  constructor() {}
  isScheduling = false;
  taskQueue = new Queue<Function>();

  pushTask(task: Function) {
    const { taskQueue, isScheduling } = this;
    taskQueue.push(task);
    if (!isScheduling) {
      ide(this.scheduleTask.bind(this));
      this.isScheduling = true;
    }
  }

  scheduleTask() {
    const { taskQueue } = this;
    // console.log('调度 dispose');
    const fn = taskQueue.first;
    if (!fn) return (this.isScheduling = false);

    const hasRemain = fn();

    // 未完成
    if (hasRemain) {
      ide(this.scheduleTask.bind(this));
      return;
    }

    // 完成
    taskQueue.shift();
    if (taskQueue.len === 0) return (this.isScheduling = false);

    // 任务列表中还有任务
    ide(this.scheduleTask.bind(this));
  }
}