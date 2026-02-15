import { dfs } from './dfs';
import { G, ScopeAbort, State } from './global';
import { Line } from './line';
import type { Signal } from './signal';
import { TaskQueue } from './task';
import { ide, now } from './util';

/** scope 释放，被重新连接的孤岛 */
// export const unTrackIsland = (signal: Signal) => {
//   // 原来是孤岛，且被 scope 管理的要恢复
//   if (signal.emitStart && signal.emitStart.downstream === signal.scope) {
//     Line.unlink(signal.emitStart);
//   }
// };

/** scope 捕获，引用外部的 signal 孤岛 */
// export const trackIsland = (signal: Signal) => {
//   // 上游节点处于孤岛状态，切有引用外部信号，需要被 scope 管理来删除外部依赖
//   if (!signal.emitStart && signal.state & State.OutLink) {
//     // 孤岛 effect、 watch、 scope 应该直接进行回收
//     if (signal.state & State.IsScope) {
//       dispose.call(signal);
//     }
//     // 孤岛 signal
//     else {
//       const line = new Line();
//       const { recEnd } = signal.scope;
//       Line.emit_line(signal, line);
//       Line.rec_line(signal.scope, line);
//       Line.line_line_rec(recEnd, line);
//     }
//   }
// };
/** 子 scope 释放，把其 only 被其持有的 signal 挂回其属于的 scope */
export const trackByOtherScopeDispose = (signal: Signal) => {
  const line = new Line();
  const { recEnd } = signal.scope;
  Line.emit_line(signal, line);
  Line.rec_line(signal.scope, line);
  Line.line_line_rec(recEnd, line);
};
export const markOutLink = (signal: Signal, downstream: Signal) => {
  // 上游是外部节点，或者上游引用了外部节点的， 做传播
  if (signal.scope !== downstream.scope || signal.state & State.OutLink) {
    downstream.state |= State.OutLink;
  }
  // else {
  //   downstream.state &= ~State.OutLink;
  // }
};

const BreakErr = '_ERR_BREAK_';
let remain = {
  stack: null as Line[],
  node: null as Signal,
  line: null as Line
};

export const ideScheduler = TaskQueue.create<{ index: number }>({
  callbackAble: ide,
  aIsUrgent(a, b) {
    return a.index < b.index;
  }
});

export function handleOneTask(scope: Signal, breakStack: Line[]) {
  breakStack = remain.stack || breakStack;
  // 将 s 同步到 remainRoot
  let lineToRemove: Line = null;
  const startTime = now();

  if (scope.emitStart) {
    Line.unlink(scope.emitStart);
  }

  try {
    dfs(scope, {
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

        // 未标记的节点，是外部节点
        if (!(node.state & State.OutLink)) {
          return true;
        }

        // 标记的节点，但是 scope 不一样，
        // 1. 其他scope的signal -> 外signal -> 内signal，把 外 scope 交给其自身 scope 管理
        // 2. 外signal ... -> ... 内scope -> 外scope|外effect
        if (lineFromUp && node.scope !== lineFromUp.downstream['scope']) {
          if (!node.scope) {
            return true;
          }
          // 是仅被 node 引用的外部节点
          if (node.emitStart === node.emitEnd) {
            // 已经 abort 只能继续释放
            if (node.scope.state & State.ScopeAborted) {
              const bound = handleOneTask.bind(null, node, []);
              bound.index = G.scopeDisposeI++;
              ideScheduler.pushTask(bound);
            }
            // 可以将其交给 原 scope 释放
            else {
              trackByOtherScopeDispose(node);
            }
          }
          // 任何外部引用都应该被断开
          return true;
        }

        // 对于嵌套作用域不允许重复进入
        node.state &= ~State.OutLink;
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
    scope.state |= State.ScopeAborted;
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
            releaseRefedSignals(scope);
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
  releaseRefedSignals(this);
  doUnlink(this.emitStart);
}

function releaseRefedSignals(scope: Signal) {
  let outLink = scope.outLink;
  while (outLink) {
    const memoNext = outLink.nextOutLink;
    unlinkSingleLine(outLink);
    outLink = memoNext;
  }
  scope.state |= State.ScopeAbort;
}
