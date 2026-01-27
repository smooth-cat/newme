import { dfs } from './dfs';
import { G, State } from './global';
import { Line } from './line';
import type { Signal } from './signal';
import { TaskQueue } from './task';
import { ide, now } from './util';

/** scope 捕获，引用外部 signal 孤岛 */
export const unTrackIsland = (signal: Signal) => {
  // 原来是孤岛，且被 scope 管理的要恢复
  if (signal.emitStart && signal.emitStart.downstream === signal.scope) {
    Line.unlink(signal.emitStart);
  }
};
/** scope 释放，被重新连接的孤岛 */
export const trackIsland = (signal: Signal) => {
  const line = new Line();
  // 上游节点处于孤岛状态，切有引用外部信号，需要被 scope 管理来删除外部依赖
  if (!signal.emitStart && signal.state & State.OutLink) {
    const { recEnd } = signal.scope;
    Line.emit_line(signal, line);
    Line.rec_line(signal.scope, line);
    Line.line_line_rec(recEnd, line);
  }
};
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

        // 1. 未标记的节点，是外部节点
        if (!(node.state & State.OutLink)) {
          return true;
        }

        // 2. 标记的节点，但是 scope 不一样，说明外部节点也引用了 另一 scope 的节点
        if (lineFromUp && node.scope !== lineFromUp.downstream['scope']) {
          // 是仅被 node 引用的外部节点
          if (node.emitStart === node.emitEnd) {
            // 已经 abort 只能继续释放
            if (scope.state & State.ScopeAborted) {
              const bound = handleOneTask.bind(undefined, node, []);
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
    Line.unlink(toDel);
    // 删除完后看看是否要被 scope 管理
    trackIsland(upstream);
    toDel = memoNext;
  }
}
