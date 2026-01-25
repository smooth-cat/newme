import { Queue, SortMap } from '../../shared/util';
import { IdeScheduler } from './scope';

export enum State {
  Clean = 0b0000,
  /** 仅用于 scope 节点是否 abort */
  ScopeAbort = 0b100000,
  OutLink = 0b010000,
  Unknown = 0b001000,
  Dirty = 0b000100,
  Check = 0b000010,
  ScopeReady = 0b000001
}

const DirtyState = State.Unknown | State.Dirty;

type Getter<T = any> = {
  (): T;
  ins?: Signal;
};

/** 原子 signal 更新次数 */
let version = 0;
let id = 0;

export type Mix<T = any> = {
  (v: T): void;
  (): T;
  v: T;
};

const dirtyLeafs = new SortMap<Signal>();

const markDeep = (signal: Signal) => {
  let level = 0;
  dfs(signal, {
    isUp: false,
    begin: ({ node }) => {
      /**
       * 1. 当前节点在预检  应该跳过
       * 2. 当前节点       已标记
       * 3. 当前节点       已放弃
       */
      // console.log('markBegin', node.id);

      if (node.state & (State.Check | State.Unknown | State.Dirty) || node.isAbort()) {
        return true;
      }

      const isEffect = level > 0;
      const isLeaf = !node.emitStart || node.emitStart.downstream['scope'] === node.emitStart.downstream;
      if (isEffect) {
        node.state |= State.Unknown;
      } else {
        node.state |= State.Dirty;
      }

      if (isLeaf && isEffect) {
        dirtyLeafs.add(node.scheduler, node);
      }
      level++;
    }
  });
  for (const key in dirtyLeafs.data) {
    const effects = dirtyLeafs.data[key];
    const scheduler = _scheduler[key];
    scheduler(effects);
  }
  dirtyLeafs.clear();
};
const unTrackIsland = (signal: Signal) => {
  // 原来是孤岛，且被 scope 管理的要恢复
  if (signal.emitStart && signal.emitStart.downstream === signal.scope) {
    Line.unlink(signal.emitStart);
  }
};
const trackIsland = (signal: Signal) => {
  const line = new Line();
  // 上游节点处于孤岛状态，切有引用外部信号，需要被 scope 管理来删除外部依赖
  if (!signal.emitStart && signal.state & State.OutLink) {
    const { recEnd } = signal.scope;
    Line.emit_line(signal, line)
    Line.rec_line(signal.scope, line)
    Line.line_line_rec(recEnd, line)
  }
};
const markOutLink = (signal: Signal, downstream: Signal) => {
  // 上游是外部节点，或者上游引用了外部节点的， 做传播
  if (signal.scope !== downstream.scope || signal.state & State.OutLink) {
    downstream.state |= State.OutLink;
  }
  // else {
  //   downstream.state &= ~State.OutLink;
  // }
};

type SignalOpt<T> = {
  customPull?: () => T;
  scheduler?: string;
  isScope?: boolean;
};

class Signal<T = any> implements Vertex {
  version = -1;
  id = id++;
  state = State.Clean;
  /** 当前节点创建时处于的 effect 就是 scope */
  scope: Signal = Signal.Pulling;
  recEnd: Line = null;
  recStart: Line = null;
  emitStart: Line = null;
  emitEnd: Line = null;
  scheduler: string = null;
  value: T = null;
  static Pulling: Signal = null;
  pull: () => T = null;

  constructor(
    private nextValue: T,
    /** 为什么是 shallow，因为 pullDeep 会把
     * 上游节点 get 执行完成，让其可以直接拿到缓存值
     */
    private customPull?: () => T
  ) {}

  static create<T>(nextValue: T, { customPull, isScope, ...rest }: SignalOpt<T>) {
    const s = new Signal(nextValue, customPull);
    s.pull = s.customPull || s.DEFAULT_PULL;
    Object.assign(s, rest);
    if (isScope) {
      s.scope = s;
    }
    return s;
  }

  DEFAULT_PULL() {
    return this.nextValue;
  }

  /**
   * 递归拉取负责建立以来链
   */
  pullRecurse(shouldLink = true) {
    let downstream = Signal.Pulling;

    if (shouldLink && downstream) {
      // 如果上游节点被 scope 管理了，解除管理
      unTrackIsland(this);
      Line.link(this, downstream);
    }
    try {
      if (this.version === version) {
        return this.value;
      }
      this.state &= ~State.OutLink;

      // 进 pullShallow 前重置 recEnd，让子 getter 重构订阅链表
      this.recEnd = undefined;

      Signal.Pulling = this;

      const v = this.pull();
      // 如果使用了 DEFAULT_PULL，处理一次 set 的取值后，替换回 customPull，如果有的话
      this.pull = this.customPull || this.DEFAULT_PULL;
      this.value = v;
      // 依赖上游的 版本号
      this.version = version;
      // if (this.value !== v) {
      // }
      return this.value;
    } catch (error) {
      console.error('计算属性报错这次不触发，后续状态可能出错', error);
      return this.value;
    } finally {
      // 本 getter 执行完成时上游 getter 通过 link，完成对下游 recLines 的更新
      const toDel = this.recEnd?.nextRecLine;
      Line.unlinkRec(toDel);
      if (shouldLink && downstream) {
        // 用于 scope 指示哪些节点依赖 scope 外部
        markOutLink(this, downstream);
      }
      Signal.Pulling = downstream;
    }
  }

  pullDeep() {
    /*----------------- 有上游节点，通过 dfs 重新计算结果 -----------------*/
    const signal = this;
    // 优化执行
    if (!(signal.state & DirtyState)) {
      return this.value;
    }
    dfs(signal, {
      isUp: true,
      begin: ({ node }) => {
        // console.log('begin', node.id);

        /**
         * 不需要检查
         * 1. 正在查
         * 2. 干净
         * 3. 放弃 或者为 scope 节点
         */
        if (node.state & State.Check || !(node.state & DirtyState) || node.isAbort()) {
          return true;
        }
        node.state |= State.Check;
        // 交给下游重新计算是否 引用外部节点
        node.state &= ~State.OutLink;
      },
      complete: ({ node, notGoDeep: currentClean, walkedLine }) => {
        let noGoSibling = false;
        const last = walkedLine[walkedLine.length - 1];
        const downstream = last?.downstream as Signal;
        // 当前正在检查，生成检查屏障，同时避免重新标记 和
        if (currentClean) {
        }
        // 当前节点需要重新计算
        else if (node.state & State.Dirty) {
          // 优化：源节点变化，直接让下游节点重新计算
          if (!node.recStart && node.value !== node.nextValue) {
            node.markDownStreamsDirty();
            node.state &= ~State.Dirty;
            node.state &= ~State.Check;
            return;
          }
          // 预检数据
          else {
            const prevPulling = Signal.Pulling;
            Signal.Pulling = downstream;
            const prevValue = node.value;
            // 递归转用递归拉取，且不需要重建 link 因为dfs的前提就是上游节点依赖于 本节点
            node.pullRecurse(false);
            // dirty 传播， 由于本节点值已被计算出，因此消除 dirty
            if (prevValue !== node.value) {
              node.markDownStreamsDirty();
            }
            node.state &= ~State.Dirty;
            Signal.Pulling = prevPulling;
            // 立刻返回父节点重新计算
            noGoSibling = true;
          }
        }
        // 没被上游节点标记为 Dirty，说明是干净的
        else if (node.state & State.Unknown) {
          node.state &= ~State.Unknown;
        }
        node.version = version;
        node.state &= ~State.Check;
        if (downstream) {
          markOutLink(node, downstream);
        }
        return noGoSibling;
      }
    });
    return this.value;
  }

  get() {
    if (this.isAbort()) {
      return this.value;
    }
    // 没有上游节点，应该通过递归重新建立
    if (!this.recStart) {
      return this.pullRecurse(true);
    }
    // 有上游节点则采用 dfs 直接遍历，查看情况
    return this.pullDeep();
  }

  markDownStreamsDirty() {
    let point = this.emitStart;
    while (point != null) {
      const downstream = point.downstream as Signal;
      downstream.state |= State.Dirty;
      downstream.state &= ~State.Unknown;
      point = point.nextEmitLine;
    }
  }

  set(v: T) {
    if (this.isAbort() || this.nextValue === v) {
      return;
    }
    this.nextValue = v;
    // 手动设值后，采用默认拉取，能拉取到设置的值，拉取完成后在替换回 customPull
    this.pull = this.DEFAULT_PULL;
    version++;
    markDeep(this as any);
  }

  run(...args: any[]) {
    if (args.length) {
      return this.set(args[0]) as any;
    }
    return this.get();
  }

  runIfDirty() {
    this.state & (State.Unknown | State.Dirty) && this.run();
  }

  isAbort() {
    return (
      // scope 被取消
      (this.scope && this.scope.state & State.ScopeAbort) ||
      // 是 scope 节点，且处于 ready 状态，不需要重复执行
      (this === this.scope && this.state & (State.ScopeAbort | State.ScopeReady))
    );
  }
}

type Vertex = {
  /** 上游来的最后一条线 */
  recEnd: Line;
  recStart: Line;
  /** 向下游发出的最后一条线 */
  emitEnd: Line;
  emitStart: Line;
};

type DFSCtxBegin = {
  node: Signal;
  lineFromUp: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};
type DFSCtxCompete = {
  node: Signal;
  lineToDeep: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

const DefaultDFSOpt = {
  isUp: false,
  begin: undefined as (dfsCtx: DFSCtxBegin) => any,
  complete: undefined as (dfsCtx: DFSCtxCompete) => any,
  breakStack: [] as Line[],
  breakLine: undefined as Line,
  breakNode: undefined as Signal
};

type DFSOpt = typeof DefaultDFSOpt;

function dfs(root: Vertex, opt: Partial<DFSOpt> = {}) {
  const { isUp, begin, complete, breakStack: lineStack, breakLine } = { ...DefaultDFSOpt, ...opt };
  let node = opt.breakNode || root;
  let line: Line = breakLine;
  const listKey = isUp ? 'recStart' : 'emitStart';
  const nodeKey = isUp ? 'upstream' : 'downstream';
  // 向上意味着要找所有节点的入度
  const nextLineKey = isUp ? 'nextRecLine' : 'nextEmitLine';
  const reverseNodeKey = isUp ? 'downstream' : 'upstream';

  while (1) {
    let notGoDeep = begin?.({
      node: node as Signal,
      lineFromUp: line,
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
      const noGoSibling = complete?.({
        node: node as Signal,
        lineToDeep: line,
        walkedLine: lineStack,
        notGoDeep
      });
      // 只对当前不下钻的节点生效
      // notGoDeep = false;
      line = lineStack.pop();
      // 递归出口，回到起点
      if (node === root) {
        return;
      }
      notGoDeep = false;
      const nextLine = line[nextLineKey];
      // 有兄弟节点， 进入外循环，向下遍历兄弟节点
      if (!noGoSibling && nextLine) {
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
  static link(v1: Signal, v2: Signal) {
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
    } else {
      // 删除尾节点
      downstream.recEnd = prevRecLine;
    }
  }

  static unlinkRec(line: Line) {
    // 作为下游，执行完 get 上游节点已经完成了依赖更新，把 recEnd 后的依赖删除即可
    let toDel = line;
    while (toDel) {
      const memoNext = toDel.nextRecLine;
      const upstream = toDel.upstream as Signal;
      Line.unlink(toDel);
      // 删除完后看看是否要被 scope 管理
      trackIsland(upstream);
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
  public upstream: Vertex = null;
  /** 上游节点 发出的上一条线 */
  public prevEmitLine: Line = null;
  /** 上游节点 发出的下一条线 */
  public nextEmitLine: Line = null;

  /** 下游顶点 */
  public downstream: Vertex = null;
  /** 下游节点 接收的上一条线 */
  public prevRecLine: Line = null;
  /** 下游节点 接收的下一条线 */
  public nextRecLine: Line = null;
  constructor() {}
}

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

let channel: MessageChannel, macroQueue: Queue<Function>;
if (globalThis.MessageChannel) {
  channel = new MessageChannel();
  macroQueue = new Queue();
  channel.port2.onmessage = () => {
    while (macroQueue.first) {
      macroQueue.shift()();
    }
  };
}
function macroScheduler(effects: Signal[]) {
  if (channel) {
    macroQueue.push(() => defaultScheduler(effects));
    channel.port1.postMessage('');
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

const now = () => {
  const timer = globalThis.performance || globalThis.Date;
  return timer.now();
};

const BreakErr = '_ERR_BREAK_';
let remain = {
  stack: null as Line[],
  node: null as Signal,
  line: null as Line
};

const ideScheduler = new IdeScheduler();

function runWithPulling(fn: Function, signal: Signal | undefined) {
  const prevPulling = Signal.Pulling;
  Signal.Pulling = signal;
  fn();
  Signal.Pulling = prevPulling;
}

function handleOneTask(s: Signal, breakStack: Line[]) {
  breakStack = remain.stack || breakStack;
  // 将 s 同步到 remainRoot
  let lineToRemove: Line = null;
  const startTime = now();
  try {
    dfs(s, {
      breakStack,
      breakNode: remain.node,
      breakLine: remain.line,
      isUp: true,
      begin: ({ walkedLine, node, lineFromUp }) => {
        if (lineToRemove) {
          Line.unlink(lineToRemove);
          lineToRemove = null;
        }

        if (now() - startTime > 5) {
          remain = {
            stack: walkedLine,
            node: node,
            line: lineFromUp
          };
          throw BreakErr;
        }

        if (!(node.state & State.OutLink)) {
          return true;
        }
      },
      complete: ({ node, notGoDeep, walkedLine }) => {
        if (lineToRemove) {
          Line.unlink(lineToRemove);
          lineToRemove = null;
        }
        if (notGoDeep) {
          const last = walkedLine[walkedLine.length - 1];
          const downstream = last?.downstream as Signal;
          // 节点没被标记 OutLink 但是发现与下游节点的 scope 不一致，是需要解除 link 的位置
          if (downstream && downstream.scope !== node.scope) {
            lineToRemove = last;
          }
        }
      }
    });
    remain = {
      stack: null,
      node: null,
      line: null
    };
  } catch (error) {
    if (error === BreakErr) return true;
    remain = {
      stack: null,
      node: null,
      line: null
    };
    throw error;
  }
}

export const scope = (fn: () => void) => {
  const s = Signal.create(undefined, { customPull: fn, isScope: true });
  s.get();
  s.state |= State.ScopeReady;
  function dispose() {
    s.state |= State.ScopeAbort;
    ideScheduler.pushTask(handleOneTask.bind(undefined, s, []));
  }
  dispose.ins = s;
  return dispose;
};

const DefaultCustomSignalOpt = {
  scheduler: Scheduler.Sync,
  isScope: false
};
export type CustomSignalOpt = typeof DefaultCustomSignalOpt;

/**
 * 数据变化时，自定义 触发订阅函数的时机
 * @param {CustomSignalOpt} opt 配置如下:
 * @prop scheduler: (runIfDirty, effect) => void 执行 runIfDirty 定制触发 effect 时机
 * @prop scope: 用于统一释放 effect link 的作用域 默认是 defaultScope 可以全局获取
 */
export const customSignal = (opt?: Partial<CustomSignalOpt>) => {
  return ((init: any, innerOpt: any = {}) => {
    const s = $(init, { ...opt, ...innerOpt });
    return s;
  }) as CreateSignal;
};

export type CreateSignal = {
  <T extends (...args: any[]) => any>(get: T, opt?: Partial<CustomSignalOpt>): Mix<ReturnType<T>>;
  <T = any>(value: T, opt?: Partial<CustomSignalOpt>): Mix<T>;
};

export const $: CreateSignal = (init?: unknown, opt: Partial<CustomSignalOpt> = {}) => {
  let intiValue: any, pull: Getter;
  if (init instanceof Function) {
    intiValue = undefined;
    pull = init as Getter;
  } else {
    intiValue = init;
  }
  const signalOpt = { ...DefaultCustomSignalOpt, ...opt, customPull: pull };
  const s = Signal.create(intiValue, signalOpt);
  const bound = s.run.bind(s);
  bound.ins = s;
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

export { type Signal };
export const watch = (values: Getter[], watcher: Function, opt?: Partial<CustomSignalOpt>) => {
  let mounted = false;
  const get = $(() => {
    for (const get of values) {
      get();
    }
    if (mounted) {
      runWithPulling(watcher, undefined);
    }
    mounted = true;
  }, opt);
  get();
  return get;
};

// const B = $(1);
// let a, c, d, b;
// const s = scope(() => {
//   a = $(true);
//   b = $(() => B.v);
//   c = $(2);

//   d = $(() => {
//     return a.v ? b.v : c.v;
//   });

//   d();
// });

// a.v = false;