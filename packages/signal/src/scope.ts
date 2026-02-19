import { dfs } from './dfs';
import { G, ScopeAbort, State } from './global';
import { Line } from './line';
import type { Signal } from './signal';

/** 子 scope 释放，把其 only 被其持有的 signal 挂回其属于的 scope */
export const trackByOtherScopeDispose = (signal: Signal) => {
  const line = new Line();
  const { recEnd } = signal.scope;
  Line.emit_line(signal, line);
  Line.rec_line(signal.scope, line);
  Line.line_line_rec(recEnd, line);
};

export function unlinkRecWithScope(line: Line) {
  // 作为下游，执行完 get 上游节点已经完成了依赖更新，把 recEnd 后的依赖删除即可
  let toDel = line;
  while (toDel) {
    const memoNext = toDel.nextRecLine;
    const upstream = toDel.upstream as Signal;
    // 的上游是 scope
    if (upstream.state & State.IsScope) {
      dispose.call(upstream);
    }
    // 删除的上游是 signal
    else {
      unlinkSingleLine(toDel);
    }
    // trackIsland(upstream);
    toDel = memoNext;
  }
}

export function unlinkSingleLine(line: Line) {
  const upstream = line.upstream as Signal;
  if (upstream.emitStart === upstream.emitEnd) {
    unlinkSingleRefedNode(upstream);
  }
  // 多处引用，断开当前即可
  else {
    Line.unlink(line);
  }
}

export function unlinkSingleRefedNode(delRoot: Signal) {
  let toUnlink: Line;
  dfs(delRoot, {
    isUp: true,
    begin: ({ node }) => {
      doUnlink(toUnlink);
      toUnlink = null;
      // 1.节点不止一个引用
      if (node.emitStart !== node.emitEnd) {
        return true;
      }
    },
    complete: ({ node, notGoDeep }) => {
      doUnlink(toUnlink);
      toUnlink = null;
      const isSingleRefed = !notGoDeep;
      // 先记录，离开这个节点后执行 unlink
      if (isSingleRefed) {
        toUnlink = node.emitStart;
      }
    }
  });
  doUnlink(toUnlink);
}

function doUnlink(line: Line) {
  if (!line) {
    return;
  }
  Line.unlink(line);
}

/** 释放 scope effect watch 的外链 */
export function dispose(this: Signal) {
  // 断开子节点的外链，以及其引用的 signals
  let toDel = this.recStart;
  while (toDel) {
    const memoNext = toDel.nextRecLine;
    const upstream = toDel.upstream as Signal;
    // 的上游是 scope，交给 dfs 处理
    if (upstream.state & State.IsScope) {
      dfs(upstream, {
        isUp: true,
        begin: ({ node }) => {
          // 1. 不是 scope 直接忽略
          // 2. 已完成标记 或 清理
          if (!(node.state & State.IsScope) || node.state & ScopeAbort) return true;
        },
        complete: ({ node: scope, notGoDeep }) => {
          const shouldAbort = !notGoDeep;
          if (shouldAbort) {
            releaseScope(scope);
          }
        }
      });
    }
    // 删除的上游是 signal
    else {
      unlinkSingleLine(toDel);
    }
    // trackIsland(upstream);
    toDel = memoNext;
  }
  // 自身的外链也需要断开
  releaseScope(this);
  doUnlink(this.emitStart);
}

function releaseScope(scope: Signal) {
  let outLink = scope.outLink;
  while (outLink) {
    const memoNext = outLink.nextOutLink;
    unlinkSingleLine(outLink);
    outLink = memoNext;
  }
  scope.state |= State.ScopeAbort;
  // clean 在 scope 释放时执行
  scope.clean?.();
  scope.clean = null;
}

export function clean(cb: () => void) {
  G.PullingSignal.clean = () => runWithPulling(cb, null) ;
}

export function runWithPulling(fn: Function, signal: Signal | null) {
  const prevPulling = G.PullingSignal;
  G.PullingSignal = signal;
  fn();
  G.PullingSignal = prevPulling;
}