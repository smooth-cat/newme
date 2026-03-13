import { NodeSort, NodeSortBit, StackItem } from './type';

// 1. 定义类别枚举
type Type = 'A' | 'B' | 'C';

// 2. 定义节点结构
interface StackNode<T> {
  value: T;
  types: NodeSortBit;
  prevGlobal: StackNode<T> | null;
  // 核心：记录在该节点加入时，各个类别的上一个节点是谁
  prevByType: Partial<Record<number, StackNode<T>>>;
}

export class MultiTypeStack<T> {
  // 记录全局栈顶
  private top: StackNode<T> | null = null;

  // 记录每个类别的当前最新节点（各分类的“栈顶”）
  private typeTops: Partial<Record<number, StackNode<T>>> = {};

  length = 0;
  /**
   * 入栈操作
   * @param value 数据
   * @param bits 该节点所属的类别数组
   */
  push(value: T, bits: NodeSortBit): void {
    const newNode: StackNode<T> = {
      value,
      types: bits,
      prevGlobal: this.top,
      prevByType: {}
    };

    let bit: number;
    while (1) {
      // 从最低位取一个类别
      bit = bits & (~bits + 1);
      if (!bit) break;
      // 去掉最低位
      bits &= ~bit;
      // 按类型链接前置节点
      newNode.prevByType[bit] = this.typeTops[bit] || undefined;
      this.typeTops[bit] = newNode;
    }

    // 更新全局栈顶
    this.top = newNode;
    this.length++;
  }

  /**
   * 出栈操作
   */
  pop() {
    if (!this.top) return undefined;

    const poppedNode = this.top;
    let { types: bits } = poppedNode;

    let bit: number;
    while (1) {
      // 从最低位取一个类别
      bit = bits & (~bits + 1);
      if (!bit) break;
      // 去掉最低位
      bits &= ~bit;
      // 弹出对应类别的“顶端”元素
      this.typeTops[bit] = poppedNode.prevByType[bit];
    }

    // 更新全局栈顶
    this.top = poppedNode.prevGlobal;
    this.length--;
    return [poppedNode.value, poppedNode.types] as const;
  }

  /**
   * 获取某个类别的当前“顶部”元素
   */
  peekByType(cat: number): T | undefined {
    return this.typeTops[cat]?.value;
  }

  peekType(): number | undefined {
    return this.top?.types;
  }

  /**
   * 获取全局栈顶
   */
  peek(): T | undefined {
    return this.top?.value;
  }

  // /**
  //  * 1. 全局向前遍历 (不分类)
  //  * 从栈顶开始，沿着全局链条向栈底遍历
  //  */
  // forEach(callback: (value: T, types: number) => any): void {
  //   let current = this.top;

  //   while (current !== null) {
  //     // 执行回调，如果返回 false 则立即停止
  //     const shouldBreak = callback(current.value, current.types);
  //     if (shouldBreak) break;

  //     current = current.prevGlobal;
  //   }
  // }

  // /**
  //  * 2. 按类别向前遍历
  //  * 仅遍历属于指定类别 cat 的节点
  //  */
  // forEachByType(cat: number, callback: (value: T) => any): void {
  //   // 从该类别的当前“顶端”节点开始
  //   let current = this.typeTops[cat];

  //   while (current) {
  //     const shouldBreak = callback(current.value);
  //     if (shouldBreak) break;

  //     // 关键点：直接跳向该节点记录的“上一个同类节点”
  //     // 这比遍历全局栈再筛选类别要快得多 (O(m) vs O(n))
  //     current = current.prevByType[cat];
  //   }
  // }
}
