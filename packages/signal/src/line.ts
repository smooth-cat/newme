import type { Signal } from './signal';
import { Vertex } from './type';

export class Line {
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
