import { _scheduler } from './schedule';

class Batch {
  deep = 0;
  start() {
    this.deep++;
  }
  end() {
    this.deep--;
    if (this.deep !== 0) return;
    // 完成 batch 后开始调度
    for (const key in _scheduler) {
      const instance = _scheduler[key];
      instance.endSet();
    }
  }

  inBatch() {
    return this.deep > 0;
  }
}

export const batch = new Batch();
