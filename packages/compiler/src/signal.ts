import { genKey, Queue, SortMap } from './util';

export enum Dirty {
  Clean = 0b0000,
  Unknown = 0b1000,
  Changed = 0b0100,
  Check = 0b0010,
  ReCompute = 0b0001
}

type Getter<T = any> = {
  (): T;
  ins?: Signal;
};

/** 原子 signal 更新次数 */
let version = 0;
let id = 0;

type Mix<T = any> = {
  (v: T): void;
  (): T;
  v: T;
};

const dirtyLeafs = new SortMap<Signal>();

const markDeep = (signal: Signal) => {
  let level = 0;
  dfs(
    signal,
    false,
    ({ node }) => {
      /**
       * 1. 当前节点在预检  应该跳过
       * 2. 当前节点       受到了上游节点影响
       * 3. 当前接单确定    变化，且未被读取
       */
      if (node.dirty & (Dirty.Check | Dirty.Unknown | Dirty.Changed | Dirty.ReCompute)) {
        return true;
      }

      const isEffect = level > 0;
      const isLeaf = !node.emitEnd;
      if (isEffect) {
        node.dirty |= Dirty.Unknown;
      } else {
        node.dirty |= Dirty.Changed;
      }

      if (isLeaf && isEffect) {
        dirtyLeafs.add(node.scheduler, node);
      }
      level++;
    },
    () => {}
  );
  for (const key in dirtyLeafs.data) {
    const effects = dirtyLeafs.data[key];
    const scheduler = _scheduler[key];
    scheduler(effects);
  }
  dirtyLeafs.clear();
};

const pullDeep = (signal: Signal) => {
  // 优化执行
  if (signal.dirty === Dirty.Clean) {
    return;
  }
  let level = 0;
  dfs(
    signal,
    true,
    ({ node }) => {
      console.log('begin', node.id);

      /**
       * 不需要检查
       * 1. 正在查
       * 2. 干净
       * 当前正在检查，生成检查屏障，
       * 同时避免 重复检查，重复标记
       */
      if (node.dirty & Dirty.Check || node.dirty === Dirty.Clean) {
        return true;
      }
      node.dirty |= Dirty.Check;
    },
    ({ node, notGoDeep: currentClean, walkedLine, lineToDeep }) => {
      console.log('complete', node.id);
      const last = walkedLine[walkedLine.length - 1];

      // 当前正在检查，生成检查屏障，同时避免重新标记 和
      if (currentClean) {
      }
      // 当前节点发生数值变化
      else if (node.dirty & Dirty.Changed) {
        const downstream = last.downstream as Signal;
        downstream.dirty &= ~Dirty.Unknown;
        downstream.dirty |= Dirty.ReCompute;
        // 去掉 Changed
        node.dirty &= ~Dirty.Changed;
      }
      // 当前节点需要重新计算
      else if (node.dirty & Dirty.ReCompute) {
        const downstream = last.downstream as Signal;
        const prevPulling = Signal.Pulling;
        Signal.Pulling = last.downstream as Signal;
        const prevVersion = node.version;
        node.get();
        // 这段逻辑在这是为了，让 最下游节点 get 逻辑
        // 和 pullDeep 过程中 get 做同样的处理
        if (prevVersion !== node.version && downstream) {
          downstream.dirty & Dirty.ReCompute;
        }
        node.dirty &= ~Dirty.ReCompute;
        Signal.Pulling = prevPulling;
      }
      // 上游节点没标记 本节点需要重新计算，则说明是干净的
      else if (node.dirty & Dirty.Unknown) {
        node.dirty = Dirty.Clean;
      }
      node.version = version;
      node.dirty &= ~Dirty.Check;
    }
  );
};

class Signal<T = any> implements Vertex {
  version = -1;
  id = id++;

  recEnd: Line;
  recStart: Line;
  emitStart: Line;
  emitEnd: Line;
  disabled: boolean;
  prev: T;
  scheduler: string;
  dirty = Dirty.Clean;
  scope = defaultScope;
  static Pulling: Signal;

  constructor(
    private value: T,
    /** 为什么是 shallow，因为 pullDeep 会把
     * 上游节点 get 执行完成，让其可以直接拿到缓存值
     */
    private pullShallow?: () => T
  ) {}

  get() {
    const callInPullDeep = this.dirty & Dirty.Check;
    if (this.version === version) {
      return this.value;
    }
    let downstream = Signal.Pulling;

    if (!callInPullDeep) {
      Line.link(this, downstream);
    }

    // 不能从其他地方拉值，那么直接返回
    if (!this.pullShallow) {
      return this.value;
    }

    // 直接深度拉取，如果 get 时本节点被标记为 Check
    // 说明是在 pullDeep 中调用了，不要再重复调用
    if (!callInPullDeep) {
      pullDeep(this);
      if (this.version === version) {
        return this.value;
      }
    }

    // 进 pullShallow 前重置 recEnd，让子 getter 重构订阅链表
    this.recEnd = undefined;

    Signal.Pulling = this;
    let changed = false;
    try {
      const v = this.pullShallow();
      if ((changed = this.value !== v)) {
        this.value = v;
        // 依赖上游的 版本号
        this.version = version;
      }
      return this.value;
    } catch (error) {
      console.error('计算属性报错这次不触发，后续状态可能出错');
      return this.value;
    } finally {
      // 本 getter 执行完成时上游 getter 通过 link，完成对下游 recLines 的更新
      const toDel = this.recEnd?.nextRecLine;
      Line.unlinkRec(toDel);
      Signal.Pulling = downstream;
    }
  }

  set(v: T) {
    if (this.disabled || this.value === v) {
      return;
    }
    this.value = v;
    this.version = ++version;
    markDeep(this as any);
  }

  run(...args: any[]) {
    if (args.length) {
      return this.set(args[0]) as any;
    }
    return this.get();
  }

  runIfDirty() {
    this.dirty & (Dirty.Unknown | Dirty.Changed) && this.run();
  }
  release() {
    // 每层 effect 都和上一层断开连接即可
    Line.unlinkRec(this.recStart);
    this.disabled = true;
  }
}

// class Effect<T = any> implements Vertex {
//   recEnd: Line;
//   recStart: Line;
//   emitStart: Line;
//   emitEnd: Line;
//   scope = defaultScope;
//   static curr: Effect;
//   id = id++;
//   memo: T;
//   timeUpdate = -1;
//   timeBeforeGet = -1;

//   dirty: Dirty;
//   released = false;

//   constructor(private fn: Getter<T>) {}
//   run() {
//     if (this.released) {
//       return this.memo;
//     }
//     // 脏状态检查
//     if (this.dirty === Dirty.Clean) {
//       return this.memo;
//     }
//     this.dirty = Dirty.Clean;

//     // 与上次 get 时时相同
//     if (this.timeBeforeGet === time) {
//       return this.memo;
//     }
//     this.timeBeforeGet = time;

//     let downstream = Effect.curr;

//     // 由上游来修改 下游的依赖情况
//     Line.link(this, downstream);
//     // get 前指针复位，上游节点的 get 通过 recEnd 重新计算这个下游节点的 recEnd
//     this.recEnd = undefined;
//     Effect.curr = this;
//     try {
//       const res = this.fn();

//       if (res !== this.memo) {
//         this.memo = res;
//         this.timeUpdate = time;
//       }
//     } catch (err) {
//       console.error(err);
//     } finally {
//       // 作为下游，执行完 get 上游节点已经完成了依赖更新，把 recEnd 后的依赖删除即可
//       const toDel = this.recEnd?.nextRecLine;
//       Line.unlinkRec(toDel);
//       Effect.curr = downstream;
//       return this.memo;
//     }
//   }
//   scheduler: string | symbol = Scheduler.Sync;

//   runIfDirty() {
//     this.dirty & (Dirty.Unknown | Dirty.Changed) && this.run();
//   }

//   release() {
//     // 每层 effect 都和上一层断开连接即可
//     Line.unlinkRec(this.recStart);
//     this.released = true;
//   }
// }

type Vertex = {
  /** 上游来的最后一条线 */
  recEnd: Line;
  recStart: Line;
  /** 向下游发出的最后一条线 */
  emitEnd: Line;
  emitStart: Line;
};

type DFSCtx = {
  node: Signal;
  lineToDeep: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

function dfs(v: Vertex, isUp = false, begin?: (dfsCtx: DFSCtx) => any, complete?: (dfsCtx: DFSCtx) => void) {
  let node = v;
  let line: Line;
  const lineStack: Line[] = [];
  const listKey = isUp ? 'recStart' : 'emitStart';
  const nodeKey = isUp ? 'upstream' : 'downstream';
  // 向上意味着要找所有节点的入度
  const nextLineKey = isUp ? 'nextRecLine' : 'nextEmitLine';
  const reverseNodeKey = isUp ? 'downstream' : 'upstream';

  while (1) {
    const notGoDeep = begin({
      node: node as Signal,
      lineToDeep: line,
      walkedLine: lineStack
    });
    lineStack.push(line);
    line = node[listKey];
    if (line && !notGoDeep) {
      const firstChild = line[nodeKey];
      node = firstChild;
      continue;
    }

    while (1) {
      complete?.({
        node: node as Signal,
        lineToDeep: line,
        walkedLine: lineStack,
        notGoDeep
      });
      line = lineStack.pop();
      // 递归出口，回到起点
      if (node === v) {
        return;
      }

      const nextLine = line[nextLineKey];
      // 有兄弟节点， 进入外循环，向下遍历兄弟节点
      if (nextLine) {
        // 外层循环后会把 sibling line 入栈，这里不需要处理
        line = nextLine;
        node = nextLine[nodeKey];
        break;
      }
      // 没有兄弟节点就上浮
      node = line[reverseNodeKey];
    }
  }
}

class Line {
  static link(v1: Vertex, v2: Signal) {
    if (!v2) return;

    let { emitEnd } = v1,
      { recEnd, recStart } = v2,
      noRecEnd = !recEnd,
      /** 模拟头节点 */
      head = { nextRecLine: recStart } as Line,
      line: Line;
    recEnd = recEnd || head;

    const { nextRecLine } = recEnd || {};
    // 没有下一个收到的线
    if (!nextRecLine) {
      line = new Line();
      // 内部会处理空链表的情况，即同步头部
      Line.emit_line(v1, line);
      Line.rec_line(v2, line);
      emitEnd && Line.line_line_emit(emitEnd, line);
      !noRecEnd && Line.line_line_rec(recEnd, line);
    }
    // 复用
    else if (nextRecLine.upstream === v1) {
      v2.recEnd = nextRecLine;
      // TODO: link 版本标记
    }
    // 插入(这么做): v1 和 下一个 入度(订阅)节点不同
    // TODO: v2上次真依赖了 v1 只是没检查出来，需要删除原依赖
    else {
      line = new Line();
      Line.emit_line(v1, line);
      Line.rec_line(v2, line);
      emitEnd && Line.line_line_emit(emitEnd, line);
      Line.insert_line_rec(recEnd, nextRecLine, line);
    }
    // 消除 head
    for (const key in head) {
      head[key] = undefined;
    }
  }

  static unlink(line: Line) {
    let { prevEmitLine, nextEmitLine, prevRecLine, nextRecLine, upstream, downstream } = line;
    line.prevEmitLine = undefined;
    line.nextEmitLine = undefined;
    line.prevRecLine = undefined;
    line.nextRecLine = undefined;
    line.upstream = undefined;
    line.downstream = undefined;

    /** 上游节点发出的线 前一条 关联 后一条 */
    if (prevEmitLine) {
      prevEmitLine.nextEmitLine = nextEmitLine;
    } else {
      // 删除的是首个节点
      upstream.emitStart = nextEmitLine;
    }
    if (nextEmitLine) {
      nextEmitLine.prevEmitLine = prevEmitLine;
    } else {
      // 删除尾节点
      upstream.emitEnd = prevEmitLine;
    }

    /** 下游节点接收的线，我们从 recEnd 开始删除的，
     * 接收信息，不需要设置 recEnd ，
     * 因为 recStart ~ recEnd 是经过上级 get 确认的有用依赖
     * */
    if (prevRecLine) {
      prevRecLine.nextRecLine = nextRecLine;
    } else {
      // 删除的是首个节点，大概率不可能从有依赖 变成无依赖
      downstream.recStart = nextRecLine;
    }
    if (nextRecLine) {
      nextRecLine.prevRecLine = prevRecLine;
    }
  }

  static unlinkRec(line: Line) {
    // 作为下游，执行完 get 上游节点已经完成了依赖更新，把 recEnd 后的依赖删除即可
    let toDel = line;
    while (toDel) {
      const memoNext = toDel.nextRecLine;
      Line.unlink(toDel);
      toDel = memoNext;
    }
  }
  static unlinkEmit(line: Line) {
    // 作为下游，执行完 get 上游节点已经完成了依赖更新，把 recEnd 后的依赖删除即可
    let toDel = line;
    while (toDel) {
      const memoNext = toDel.nextEmitLine;
      Line.unlink(toDel);
      toDel = memoNext;
    }
  }

  /** 上游节点 连 link */
  static emit_line(upstream: Vertex, line: Line) {
    if (!upstream.emitStart) {
      upstream.emitStart = line;
    }
    upstream.emitEnd = line;
    line.upstream = upstream;
  }
  /** 下游节点 连 link */
  static rec_line(downstream: Vertex, line: Line) {
    if (!downstream.recStart) {
      downstream.recStart = line;
    }
    downstream.recEnd = line;
    line.downstream = downstream;
  }

  /** 同一节点发出的 两个条线 相连 */
  static line_line_emit(l1: Line, l2: Line) {
    if (!l1 || !l2) return;
    l1.nextEmitLine = l2;
    l2.prevEmitLine = l1;
  }

  /** 同一节点接收的 两个条线 相连 */
  static line_line_rec(l1: Line, l2: Line) {
    if (!l1 || !l2) return;
    l1.nextRecLine = l2;
    l2.prevRecLine = l1;
  }

  static insert_line_emit(l1: Line, l2: Line, ins: Line) {
    l1.nextEmitLine = ins;
    ins.prevEmitLine = l1;
    l2.prevEmitLine = ins;
    ins.nextEmitLine = l2;
  }

  static insert_line_rec(l1: Line, l2: Line, ins: Line) {
    l1.nextRecLine = ins;
    ins.prevRecLine = l1;
    l2.prevRecLine = ins;
    ins.nextRecLine = l2;
  }

  /** 上游顶点 */
  public upstream: Vertex;
  /** 上游节点 发出的上一条线 */
  public prevEmitLine: Line;
  /** 上游节点 发出的下一条线 */
  public nextEmitLine: Line;

  /** 下游顶点 */
  public downstream: Vertex;
  /** 下游节点 接收的上一条线 */
  public prevRecLine: Line;
  /** 下游节点 接收的下一条线 */
  public nextRecLine: Line;
  constructor() {}
}

class Scope {
  signals: Signal[];
  /**
   * 释放当前所有作用域下的 effect，
   * 此前创建的 effect 不再生效，computed 永久返回最后一次执行的值
   *  */
  release() {
    for (const effect of this.signals) {
      effect.release();
    }
    this.signals = [];
  }
}

export const scope = () => new Scope();

export const defaultScope = new Scope();

type ScheduleHandler = (effects: Signal[]) => any;

export enum Scheduler {
  Sync = '__Sync_',
  Layout = '__Layout_',
  Micro = '__Micro_',
  Macro = '__Macro_'
}

const _scheduler: Record<string | symbol, ScheduleHandler> = {
  [Scheduler.Sync]: defaultScheduler,
  [Scheduler.Micro]: microScheduler,
  [Scheduler.Macro]: macroScheduler,
  [Scheduler.Layout]: schedulerLayout
};
export const scheduler = (key: string | symbol, value: ScheduleHandler) => (_scheduler[key] = value);

function defaultScheduler(effects: Signal[]) {
  for (const effect of effects) {
    effect.runIfDirty();
  }
}
const p = Promise.resolve();
function microScheduler(effects: Signal[]) {
  p.then(() => {
    defaultScheduler(effects);
  });
}

let c: MessageChannel, macroQueue: Queue<Function>;
if (globalThis.MessageChannel) {
  c = new MessageChannel();
  macroQueue = new Queue();
  c.port2.onmessage = () => {
    while (macroQueue.first) {
      macroQueue.shift()();
    }
  };
}
function macroScheduler(effects: Signal[]) {
  if (c) {
    macroQueue.push(() => defaultScheduler(effects));
    c.port1.postMessage('');
  }
  setTimeout(() => {
    defaultScheduler(effects);
  });
}
function schedulerLayout(effects: Signal[]) {
  requestAnimationFrame(() => {
    defaultScheduler(effects);
  });
}

const DefaultCustomEffectOpt = {
  scheduler: Scheduler.Sync,
  scope: defaultScope
};
export type CustomEffectOpt = typeof DefaultCustomEffectOpt;

/**
 * 数据变化时，自定义 触发订阅函数的时机
 * @param {CustomEffectOpt} opt 配置如下:
 * @prop scheduler: (runIfDirty, effect) => void 执行 runIfDirty 定制触发 effect 时机
 * @prop scope: 用于统一释放 effect link 的作用域 默认是 defaultScope 可以全局获取
 */
export const customEffect = (opt: Partial<CustomEffectOpt> = {}) => {
  opt = { ...DefaultCustomEffectOpt, ...opt };
  return <T>(fn: Getter<T>) => {
    const ef = new Signal(fn);
    ef.scope = opt.scope;
    ef.scheduler = opt.scheduler;
    return ef.run.bind(ef);
  };
};

export type CreateSignal = {
  <T extends (...args: any[]) => any>(get: T, scheduleType?: Scheduler): T & { v: T };
  <T = any>(value: T, scheduleType?: Scheduler): Mix<T>;
};

export const $: CreateSignal = (init?: unknown, scheduleType = Scheduler.Sync) => {
  let intiValue: any, pull: Getter;
  if (init instanceof Function) {
    intiValue = undefined;
    pull = init as Getter;
  } else {
    intiValue = init;
  }
  const s = new Signal(intiValue, pull);
  s.scheduler = scheduleType;
  const bound = s.run.bind(s);
  bound['ins'] = s;
  Object.defineProperty(bound, 'v', {
    get() {
      return s.get();
    },
    set(v) {
      return s.set(v);
    }
  });
  return bound as any;
};

export const watch = (values: Getter[], watcher: Function, scheduleType: Scheduler = Scheduler.Sync) => {
  let mounted = false;
  $(() => {
    for (const get of values) {
      get();
    }
    if (mounted) {
      watcher();
    }
    mounted = true;
  }, scheduleType);
};

const v0 = $(1);

const v1 = $(() => {
  const abs = Math.abs(v0.v);
  return abs;
});

const ef2 = $(() => {
  console.log('v1', v1.v);
});

ef2();

v0(-1);

console.log(1);
