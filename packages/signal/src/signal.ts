import { dfs } from './dfs';
import { dirtyLeafs, DirtyState, G, ScopeExecuted, State } from './global';
import { Line } from './line';
import { _scheduler } from './schedule';
import { runWithPulling, unlinkRecWithScope } from './scope';
import { SignalOpt, Vertex } from './type';

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

      if (node.state & (State.Check | State.Unknown | State.Dirty) || node.isDisabled()) {
        return true;
      }

      const isEffect = level > 0;
      // 没有下游，或者下游是 scope
      const isLeaf = !node.emitStart || node.emitStart.downstream === node.scope;
      if (isEffect) {
        node.state |= State.Unknown;
      }
      // 源节点是叶子节点，不做标记，后续可以通过 get 重新拉取到新值
      else if (!isLeaf) {
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

export class Signal<T = any> implements Vertex {
  version = -1;
  id = G.id++;
  state = State.Clean;
  /** 当前节点创建时处于的 effect 就是 scope */
  scope: Signal = G.PullingSignal;
  recEnd: Line = null;
  recStart: Line = null;
  emitStart: Line = null;
  emitEnd: Line = null;
  scheduler: string = null;
  value: T = null;
  outLink: Line = null;
  static Pulling: Signal = null;
  pull: () => T = null;

  constructor(
    private nextValue: T,
    /** 为什么是 shallow，因为 pullDeep 会把
     * 上游节点 get 执行完成，让其可以直接拿到缓存值
     */
    private customPull?: () => T
  ) {}

  static create<T>(nextValue: T, { customPull, isScope, immediate, ...rest }: SignalOpt<T>) {
    const s = new Signal(nextValue, customPull);
    s.pull = s.customPull || s.DEFAULT_PULL;
    Object.assign(s, rest);
    if (isScope) {
      s.state |= State.IsScope;
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
    let downstream = G.PullingSignal;
    const isScope = this.state & State.IsScope;

    if (
      // 1. 外部支持 link
      shouldLink &&
      // 2. 有下游
      downstream &&
      // 3. 下游是 watcher，不链接非 scope
      !(downstream.state & State.LinkScopeOnly && !isScope)
    ) {
      Line.link(this, downstream);
    }
    try {
      if (this.version === G.version) {
        return this.value;
      }

      // 进 pullShallow 前重置 recEnd，让子 getter 重构订阅链表
      this.recEnd = null;

      G.PullingSignal = this;
      this.clean?.();
      this.clean = null;
      let v = this.pull();
      if (isScope && typeof v === 'function') {
        const fn = v;
        this.clean = () => runWithPulling(fn, null);
        v = this.value;
      }
      // 如果使用了 DEFAULT_PULL，处理一次 set 的取值后，替换回 customPull，如果有的话
      this.pull = this.customPull || this.DEFAULT_PULL;
      this.value = v;
      // 依赖上游的 版本号
      this.version = G.version;
      // if (this.value !== v) {
      // }
      return this.value;
    } catch (error) {
      console.error('计算属性报错这次不触发，后续状态可能出错', error);
      return this.value;
    } finally {
      // 本 getter 执行完成时上游 getter 通过 link，完成对下游 recLines 的更新
      const toDel = this.recEnd?.nextRecLine;
      unlinkRecWithScope(toDel);
      G.PullingSignal = downstream;
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
        if (node.state & State.Check || !(node.state & DirtyState) || node.isDisabled()) {
          return true;
        }
        node.state |= State.Check;
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
            const prevPulling = G.PullingSignal;
            G.PullingSignal = downstream;
            const prevValue = node.value;
            // 递归转用递归拉取，且不需要重建 link 因为dfs的前提就是上游节点依赖于 本节点
            node.pullRecurse(false);
            // dirty 传播， 由于本节点值已被计算出，因此消除 dirty
            if (prevValue !== node.value) {
              node.markDownStreamsDirty();
            }
            node.state &= ~State.Dirty;
            G.PullingSignal = prevPulling;
            // 立刻返回父节点重新计算
            noGoSibling = true;
          }
        }
        // 没被上游节点标记为 Dirty，说明是干净的
        else if (node.state & State.Unknown) {
          node.state &= ~State.Unknown;
        }
        node.version = G.version;
        node.state &= ~State.Check;
        return noGoSibling;
      }
    });
    return this.value;
  }

  get v() {
    if (this.isDisabled()) {
      return this.value;
    }
    // 没有上游节点，应该通过递归重新建立
    if (!this.recStart) {
      return this.pullRecurse(true);
    }
    // 有上游节点则采用 dfs 直接遍历，查看情况
    return this.pullDeep();
  }

  // pause() {
  //   this.state |= State.SelfPaused;
  // }

  // resume() {
  //   this.state &= ~State.SelfPaused;
  // }

  markDownStreamsDirty() {
    let point = this.emitStart;
    while (point != null) {
      const downstream = point.downstream as Signal;
      downstream.state |= State.Dirty;
      downstream.state &= ~State.Unknown;
      point = point.nextEmitLine;
    }
  }

  set v(v: T) {
    if (this.isDisabled() || this.nextValue === v) {
      return;
    }
    this.nextValue = v;
    // 手动设值后，采用默认拉取，能拉取到设置的值，拉取完成后在替换回 customPull
    this.pull = this.DEFAULT_PULL;
    G.version++;
    markDeep(this as any);
  }

  runIfDirty() {
    this.state & (State.Unknown | State.Dirty) && this.v;
  }

  isDisabled() {
    return (
      // scope 被取消
      (this.scope && this.scope.state & State.ScopeAbort) ||
      // 是 scope 节点，且处于 ready 状态，不需要重复执行
      (this.state & State.IsScope && this.state & ScopeExecuted)
    );
  }
  /** 记录当前 effect 中 clean */
  clean: () => void = null;
}
