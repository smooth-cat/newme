export type QueueItem<T> = {
  v: T;
  prev?: QueueItem<T>;
  next?: QueueItem<T>;
};

export class Queue<T> {
  _first?: QueueItem<T>;
  get first() {
    return this._first?.v!;
  }
  _last?: QueueItem<T>;
  get last() {
    return this._last?.v!;
  }
  len = 0;
  push(it: T) {
    return this.insetAfter(it, this._last);
  }

  insetAfter(it: T, anchor: QueueItem<T>) {
    const item = { v: it, prev: null, next: null } as QueueItem<T>;
    const prev = anchor || this._first?.prev;
    const after = prev ? prev.next : this._first;
    item.prev = prev;
    item.next = after;

    if (prev) {
      // 子 Queue 逻辑
      if (prev.next === this._first) this._first = item;
      prev.next = item;
    } else {
      this._first = item;
    }
    if (after) {
      if (after.prev === this._last) this._last = item;
      after.prev = item;
    } else {
      this._last = item;
    }
    this.len++;
    return item;
  }

  delete(item: QueueItem<T>) {
    const { prev, next } = item;
    if (prev) {
      if (item === this._first) this._first = next;
      prev.next = next;
    } else {
      this._first = next;
    }
    if (next) {
      if (item === this._last) this._last = prev;
      next.prev = prev;
    } else {
      this._last = prev;
    }
    item.next = null;
    item.prev = null;
    this.len--;
    return item.v;
  }

  static forEach<V>(firstItem: QueueItem<V>, lastItem: QueueItem<V>, fn: (value: V, item: QueueItem<V>) => void) {
    if (!firstItem) return;
    let point = firstItem;
    let next = point.next;
    while (true) {
      fn(point.v, point);
      if (!next || point === lastItem) {
        break;
      }
      point = next;
      next = point.next;
    }
  }

  forEach(fn: (value: T, item: QueueItem<T>) => void) {
    if (!this._first) return;
    let point = this._first;
    let next = point.next;
    while (true) {
      fn(point.v, point);
      if (!next || point === this._last) {
        break;
      }
      point = next;
      next = point.next;
    }
  }
  /** TODO: Queue.len 不准确 */
  subRef(firstItem: QueueItem<T>, lastItem: QueueItem<T>) {
    const subQueue = new Queue<T>();
    subQueue._first = firstItem;
    subQueue._last = lastItem;
    return subQueue as SubQueue<T>;
  }

  shift() {
    return this.delete(this._first);
  }

  clone() {
    const c = new Queue<T>();
    let point = this._first;
    if (!point) return c;
    while (true) {
      c.push(point.v);
      if (point === this._last) break;
      point = point.next;
    }
    return c;
  }
}

export type SubQueue<T> = Omit<Queue<T>, 'push' | 'insetAfter' | 'delete' | 'shift'>;

export function isNum(char: string) {
  return (
    char === '0' ||
    char === '1' ||
    char === '2' ||
    char === '3' ||
    char === '4' ||
    char === '5' ||
    char === '6' ||
    char === '7' ||
    char === '8' ||
    char === '9'
  );
}

export const genKey = (v: string | number) => `${v}-${Date.now()}-${Math.random()}` as unknown as number;

export class SortMap<T> {
  data: Record<string | symbol, Queue<T>> = {};
  clear() {
    this.data = {};
  }
  add(key: string | symbol, value: T) {
    const { data } = this;
    let list = data[key];
    if (!list) {
      list = new Queue<T>();
      data[key] = list;
    }
    return list.push(value);
  }
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]) {
  return keys.reduce(
    (acc, key) => {
      acc[key] = obj[key];
      return acc;
    },
    {} as Pick<T, K>
  );
}

const NatureNum = /^(0|[1-9]\d*)$/;
export const isNatureNumStr = (val: unknown) => typeof val === 'string' && NatureNum.test(val);
/**
 * 替代 /[\$\d\w\/]/.test(char) 的高性能版本
 * @param {string} char - 传入的单个字符
 * @returns {boolean}
 */
export const matchIdStart = (char: string) => {
  // 获取第一个字符的 Unicode 编码
  const code = char.charCodeAt(0);

  // 1. 数字 0-9 (48-57)
  return (
    (code >= 48 && code <= 57) ||
    // 2. 大写字母 A-Z (65-90)
    (code >= 65 && code <= 90) ||
    // 3. 小写字母 a-z (97-122)
    (code >= 97 && code <= 122) ||
    // 4. 下划线 _ (95)
    code === 95 ||
    // 5. 斜杠 / (47)
    code === 47 ||
    // 5. $ / (36)
    code === 36
  );
};

// const queue = new Queue([1,2,3,4]);
// queue.shift()
// queue.pop()
// // @ts-ignore
// queue.unshift('a')
// // @ts-ignore
// queue.push('b')
// queue.shift()
// queue.pop()
// queue.shift()
// queue.pop()
// queue.shift()
// queue.pop()
// queue.push(10)
// queue.array();
