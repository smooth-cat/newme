import type { Signal } from './signal';
import { Line } from './line';
import { DFSCtxBegin, DFSCtxCompete, Vertex } from './type';

const DefaultDFSOpt = {
  isUp: false,
  begin: null as (dfsCtx: DFSCtxBegin) => any,
  complete: null as (dfsCtx: DFSCtxCompete) => any,
  breakStack: [] as Line[],
  breakLine: null as Line,
  breakNode: null as Signal
};

type DFSOpt = typeof DefaultDFSOpt;

export function dfs(root: Vertex, opt: Partial<DFSOpt> = {}) {
  const { isUp, begin, complete, breakStack: lineStack, breakLine } = { ...DefaultDFSOpt, ...opt };
  let node = opt.breakNode || root;
  let line: Line = breakLine;
  const listKey = isUp ? 'recStart' : 'emitStart';
  const nodeKey = isUp ? 'upstream' : 'downstream';
  // 向上意味着要找所有节点的入度
  const nextLineKey = isUp ? 'nextRecLine' : 'nextEmitLine';
  const reverseNodeKey = isUp ? 'downstream' : 'upstream';

  while (true) {
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

    while (true) {
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


const dfsUp = (root: Signal) => {
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
      recStart = node.recStart,
      scheduler = node.scheduler;

    if (recStart && !noGoDeep) {
      // 下潜：记录来时的路
      stack[++i] = recStart;
      parent = node;
      node = recStart.upstream as Signal;
      noGoDeep = false;
      continue;
    }

    while (true) {
      // 上浮：通过 walked 找到父节点
      const backLine = stack[i];

      const nextLine = backLine.nextRecLine;

      // 兄弟节点，父节点不变
      if (nextLine) {
        node = nextLine.upstream as Signal;
        stack[i] = nextLine;
        break;
      }

      // 回溯到父节点继续上浮循环
      node = parent;
      if (i === 0) {
        break outer;
      } else {
        parent = stack[--i].downstream;
      }
    }
  } while (true);
};
const dfsDown = (root: Signal) => {
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
