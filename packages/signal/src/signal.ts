import { dfs } from './dfs';
import { DirtyState, G, ScopeExecuted, State } from './global';
import { Line } from './line';
import { _scheduler } from './schedule';
import { runWithPulling, unlinkRecWithScope } from './scope';
import { SignalOpt, Vertex } from './type';
const markDeep = (root: Signal) => {
  let node: Signal = root,
    i = -1,
    parent: Signal;
  const stack: Line[] = [];
  outer: do {
    let noGoDeep = false;
    // begin

    /**
     * 1. 已放弃节点， 或 scope，不做标记
     * 2. scope 节点
     */
    const state = node.state,
      emitStart = node.emitStart,
      scheduler = node.scheduler;
    if (
      (node.scope && node.scope.state & State.ScopeAbort) ||
      // 是 scope 节点，且处于 ready 状态，不需要重复执行
      node.state & ScopeExecuted
    ) {
      noGoDeep = true;
    } else {
      const inPullingArea = state & State.Pulling;
      const isEffect = parent !== undefined;
      const isLeaf = !emitStart || emitStart.downstream === node.scope;

      // 1. 确定状态标记位
      // 如果在 Pulling 区域，Effect 标记为 PullingUnknown，否则为 Unknown/Dirty
      if (isEffect) {
        node.state |= inPullingArea ? State.PullingUnknown : State.Unknown;
      } else if (!isLeaf) {
        node.state |= State.Dirty;
      }

      // 2. 处理叶子节点（Effect 调度与截断）
      if (isLeaf) {
        noGoDeep = true;

        // 只有非 Pulling 状态下的 Effect 节点需要加入调度队列
        if (isEffect && !inPullingArea) {
          const instance = _scheduler[scheduler];
          const item = instance.addEffect(node);

          instance.firstEffectItem ??= item;
          instance.lastEffectItem = item;
        }
      }
    }

    if (emitStart && !noGoDeep) {
      // 下潜：记录来时的路
      stack[++i] = emitStart;
      parent = node;
      node = emitStart.downstream as Signal;
      noGoDeep = false;
      continue;
    }

    while (true) {
      // 上浮：通过 walked 找到父节点
      const backLine = stack[i];

      const nextLine = backLine.nextEmitLine;

      // 兄弟节点，父节点不变
      if (nextLine) {
        node = nextLine.downstream as Signal;
        stack[i] = nextLine;
        break;
      }

      // 回溯到父节点继续上浮循环
      node = parent;
      if (i === 0) {
        break outer;
      } else {
        parent = stack[--i].upstream;
      }
    }
  } while (true);
};

const pullingPostprocess = (node: Signal) => {
  let s = node.state;
  s &= ~State.Pulling; // 移除 Pulling 状态

  if (s & State.PullingUnknown) {
    // 同时移除 PullingUnknown 并加上 Unknown
    // 使用位掩码：s = (s & ~State.PullingUnknown) | State.Unknown
    s = (s & ~State.PullingUnknown) | State.Unknown;
  }

  node.state = s;
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
    public nextValue: T,
    /** 为什么是 shallow，因为 pullDeep 会把
     * 上游节点 get 执行完成，让其可以直接拿到缓存值
     */
    private customPull?: () => T
  ) {}

  static create<T>(nextValue: T, { customPull, isScope, scope, immediate, ...rest }: SignalOpt<T>) {
    const s = new Signal(nextValue, customPull);
    s.pull = s.customPull || s.DEFAULT_PULL;
    // TODO: 性能优化 0,1ms
    Object.assign(s, rest);
    if (isScope) {
      s.state |= State.IsScope;
    }
    if (scope !== undefined) {
      s.scope = scope;
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
    G.PullingRecurseDeep++;
    const downstream = G.PullingSignal;
    this.linkWhenPull(downstream, shouldLink);
    try {
      if (this.version === G.version) {
        return this.value;
      }
      // 进 pullShallow 前重置 recEnd，让子 getter 重构订阅链表
      if (this.pull !== this.DEFAULT_PULL) this.recEnd = null;
      this.state |= State.Pulling;
      G.PullingSignal = this;
      this.clean?.();
      this.clean = null;
      let v = this.pull();
      if (this.state & State.IsScope && typeof v === 'function') {
        const fn = v;
        this.clean = () => runWithPulling(fn as any, null);
        v = this.value;
      }
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
      // 如果使用了 DEFAULT_PULL，处理一次 set 的取值后，替换回 customPull，如果有的话
      this.pull = this.customPull || this.DEFAULT_PULL;
      pullingPostprocess(this);
      // 本 getter 执行完成时上游 getter 通过 link，完成对下游 recLines 的更新
      const toDel = this.recEnd?.nextRecLine;
      unlinkRecWithScope(toDel);
      G.PullingSignal = downstream;
      G.PullingRecurseDeep--;
    }
  }

  linkWhenPull(downstream: Signal, shouldLink: boolean) {
    const isScope = this.state & State.IsScope;
    if (
      // 2. 有下游
      downstream &&
      shouldLink &&
      // 3. 下游是 watcher 不是 watch，或 是watcher 但 当前是 scope
      ((downstream.state & State.LinkScopeOnly) === 0 || isScope) &&
      /**4. scope 只能被一个下游节点管理，就是初始化它的那个下游节点
       * 发生在 outEffect(() => scope(() => innerEffect(), null))
       * 虽然通过 scope 让 innerEffect 被管理，
       * 如果 innerEffect 在 outEffect 中被再次触发，就导致其被 outEffect 管理，
       * 若 outEffect 后续重新触发， 则导致 innerEffect 被销毁
       */
      (!isScope || !this.emitStart)
    ) {
      Line.link(this, downstream);
    }
  }

  pullDeep() {
    /*----------------- 有上游节点，通过 dfs 重新计算结果 -----------------*/
    const signal = this;
    // 优化执行
    if (signal.state & DirtyState) {
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
          if (node.state & (State.Pulling | State.Dirty) || (node.state & DirtyState) === 0 || node.isDisabled()) {
            return true;
          }
          node.state |= State.Pulling;
        },
        complete: ({ node, notGoDeep: cleanOrDirty, walkedLine }) => {
          const isDirty = node.state & State.Dirty;
          // 1. 非 Dirty 的情况
          let currentClean = cleanOrDirty && !isDirty;
          // 2. 已在处理 Dirty 节点 跳过
          if (cleanOrDirty && node.state & State.Pulling) {
            currentClean = true;
          }
          let noGoSibling = false;
          const last = walkedLine[walkedLine.length - 1];
          const downstream = last?.downstream as Signal;
          // 当前正在检查，生成检查屏障，同时避免重新标记 和
          if (currentClean) {
          }
          // 当前节点需要重新计算
          else if (isDirty) {
            // 优化：源节点变化，直接让下游节点重新计算
            // if (!node.recStart && node.value !== node.nextValue) {
            if (node.pull === node.DEFAULT_PULL && node.value !== node.nextValue) {
              node.markDownStreamsDirty();
              node.state &= ~State.Dirty;
              // 源接节点不需要做 PullingUnknown => Unknown 转换
              node.state &= ~State.Pulling;
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
          pullingPostprocess(node);
          return noGoSibling;
        }
      });
    }
    // 此处要建立执行 pullDeep 的 signal 和 downstream 的连接
    const downstream = G.PullingSignal;
    this.linkWhenPull(downstream, true);
    return this.value;
  }

  get v() {
    if (this.isDisabled()) {
      return this.value;
    }
    // 1. 没有上游节点
    // 2. 本节点标记了 Dirty
    // 应该通过递归重新建立
    if (!this.recStart || this.pull === this.DEFAULT_PULL) {
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
    if (this.emitStart) {
      markDeep(this as any);
      if (batchDeep === 0) {
        this.scheduleEffect();
      }
    }
  }

  scheduleEffect() {
    for (const key in _scheduler) {
      const instance = _scheduler[key];
      instance.endSet();
    }
  }

  /** 返回值为 true 表示已处理 */
  runIfDirty() {
    this.state & (State.Unknown | State.Dirty) && this.v;
  }

  isDisabled() {
    return (
      // scope 被取消
      (this.scope && this.scope.state & State.ScopeAbort) ||
      // 是 scope 节点，且处于 ready 状态，不需要重复执行
      this.state & ScopeExecuted
    );
  }
  /** 记录当前 effect 中 clean */
  clean: () => void = null;
}

let batchDeep = 0;
export function batchStart() {
  batchDeep++;
}
export function batchEnd() {
  if (--batchDeep) return;
  // 完成 batch 后开始调度
  for (const key in _scheduler) {
    const instance = _scheduler[key];
    instance.endSet();
  }
}
