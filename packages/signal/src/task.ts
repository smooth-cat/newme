import { evt } from './global';
import { PriorityQueue } from './priority-queue';
import { CreateTaskProps, Task } from './type';


export class TaskQueue<T> {
  constructor(
    public callbackAble: CreateTaskProps<T>['callbackAble'],
    public aIsUrgent: CreateTaskProps<T>['aIsUrgent']
  ) {}
  isScheduling = false;
  taskQueue: PriorityQueue<Task & T>;
  static create<T>({ callbackAble, aIsUrgent }: CreateTaskProps<T>) {
    const queue = new TaskQueue<Task & T>(callbackAble, aIsUrgent);
    queue.taskQueue = new PriorityQueue<Task & T>(aIsUrgent);
    return queue;
  }

  pushTask(task: Task & T) {
    const { taskQueue, isScheduling } = this;
    taskQueue._add(task);
    if (!isScheduling) {
      this.callbackAble(this.scheduleTask.bind(this));
      this.isScheduling = true;
    }
  }

  scheduleTask() {
    const { taskQueue } = this;
    // console.log('调度 dispose');
    const fn = taskQueue.peek();
    if (!fn) return (this.isScheduling = false);

    const hasRemain = fn();

    // 未完成
    if (hasRemain) {
      this.callbackAble(this.scheduleTask.bind(this));
      return;
    }

    // 完成
    taskQueue.poll();
    evt.emit('one', fn)
    if (taskQueue.size() === 0) {
      evt.emit('done', fn)
      return (this.isScheduling = false)
    };

    // 任务列表中还有任务
    this.callbackAble(this.scheduleTask.bind(this));
  }
}
