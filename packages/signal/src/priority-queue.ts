/**
 * 这是一个优先队列 （满足子节点总是比父节点大）
 *                    1
 *
 *               10          20
 *
 *          15    30      25      30
 *
 *       17
 *  现在插入 7 ， 会按广度优先的顺序插入在数组尾部
 *                    1
 *
 *               10          20
 *
 *          15    30      25      30
 *
 *       17    7
 * 接着我们只需要将 7  逐层与上门的父节点比较， 7 较小则两者交互，一直让 7 上浮到适合的位置
 *
 *                          0
 *
 *                    1           2                 2^0 得到第二层第一个索引
 *
 *              3       4     5       6            2^0 + 2^1 。。。 + 2^n + x = y
 *
 *          7      8
 * 上浮后我们得到以上的树
 */
// 父子节点的关系
// 计算一个节点的 index 公式 ①   2^0 + 2^1 。。。 + 2^n + y = x 已知
// 节点的左子节点 index     ②   2^0 + 2^1 。。。 + 2^n + 2^(n+1) + z = res 求 res
// ② - ① 得到 2^(n+1) + (z-y) = res - x
// 2^(n+1) + (z-y) + x = res
// 而 z 和 y 的关系是，③ z = 2y

// 2^(n+1) + y + x = res;
// 2^n +  (2^n + y) + x = res;

// 根据① 可得  2^n + y = x - 2^0~2^(n-1);
// 2^n +  (2^n + y) + x = res;
// 2^n + (x - (2^0+~2^(n-1))) + x = res;
// 2^n - (2^0+~2^(n-1)) + 2x = res;
// 1 + 2x = res;

type IGetIndex = (v: number, max: number) => number | null;
export const leakI: IGetIndex = (y, max) => (y < 0 || y >= max ? null : y);
const getLeft: IGetIndex = (x, max) => leakI(x * 2 + 1, max);
const getRight: IGetIndex = (x, max) => leakI(x * 2 + 2, max);
const getParent: IGetIndex = (x, max) => leakI((x - 1) >>> 1, max);

const exchange = (arr, i, j) => ([arr[i], arr[j]] = [arr[j], arr[i]]);
export class PriorityQueue<T> {
  arr: T[] = [];
  // 构造函数接受一个compare函数
  // compare返回的-1, 0, 1决定元素是否优先被去除
  constructor(public aIsUrgent: (a: T, b: T) => boolean) {
  }

  // 添加一个元素
  _add(current: T) {
    // console.log(`加入 ${current}`);
    this.arr.push(current);
    const len = this.size();
    // this.logTree();
    if (len === 1) {
      return;
    }
    this.goUp(this.arr, current, len);
  }

  add(...items: T[]) {
    items.forEach(it => this._add(it));
  }

  goUp = (arr: T[], current: T, len: number) => {
    let i = len - 1;
    while (i > 0) {
      const item = arr[i];
      const pI = getParent(i, len)!;
      const parent = arr[pI];
      if (this.aIsUrgent(item, parent)) {
        // console.log(`交换 parent:${parent} -> child:${item} `);
        exchange(arr, i, pI);
        // this.logTree();
        i = pI;
      } else {
        // console.log(`parent:${parent} child:${item} 不需要交换 \n`);
        break;
      }
    }
  };

  // 去除头元素并返回
  poll() {
    const { arr } = this;
    // console.log(`弹出 ${arr[0]} 把 ${arr[arr.length - 1]} 放置到队头 `);
    const len = this.size();
    if (len <= 2) {
      return arr.shift();
    }

    const last = arr.pop();
    const first = arr[0];
    arr[0] = last!;
    // this.logTree();
    this.goDown(this.arr, 0);
    return first;
  }

  goDown = (arr: T[], i: number) => {
    const len = this.size();
    const half = len >>> 1;
    while (i < half) {
      const lI = getLeft(i, len);
      const rI = getRight(i, len);
      let point = i;

      if (lI != null && this.aIsUrgent(arr[lI], arr[point])) {
        point = lI;
      }
      if (rI != null && this.aIsUrgent(arr[rI], arr[point])) {
        point = rI;
      }
      if (point === i) {
        break;
      }
      // console.log(`交换 parent:${arr[i]} -> child:${arr[point]} `);
      exchange(arr, i, point);
      // this.logTree();
      i = point;
    }
  };

  // 取得头元素
  peek() {
    return this.arr[0];
  }
  // 取得元素数量
  size() {
    return this.arr.length;
  }

  logTree() {
    const { arr } = this;
    let i = 0;
    let j = 1;
    let level = 0;
    const matrix: T[][] = [];
    do {
      matrix.push(arr.slice(i, j));
      i = i * 2 + 1;
      j = i + Math.pow(2, level) + 1;
      level++;
    } while (i < arr.length);
    const last = Math.pow(2, matrix.length - 1);
    const arrStr = JSON.stringify(last);
    const halfLen = arrStr.length >>> 1;

    matrix.forEach(it => {
      const str = JSON.stringify(it);
      const halfIt = str.length >>> 1;
      console.log(str.padStart(halfLen + halfIt, ' '));
    });
    console.log('\n');
  }
}

// case 1
// const pq = new PriorityQueue((a, b) => a - b)
// pq.add(5)
// pq.add(3)
// pq.add(1)
// pq.add(4)
// pq.add(2)
// const result = []
// while (pq.size() > 0) {
//   result.push(pq.poll())
// }
// console.log(result);
// [1,2,3,4,5]

// case 2
// const pq = new PriorityQueue((a, b) => b - a)
// pq.add(1)
// pq.add(3)
// pq.add(4)
// pq.add(5)
// pq.add(2)
// const result = []
// while (pq.size() > 0) {
//   result.push(pq.poll())
// }
// console.log(result);
// [5,4,3,2,1]
