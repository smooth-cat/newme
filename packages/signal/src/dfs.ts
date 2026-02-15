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
