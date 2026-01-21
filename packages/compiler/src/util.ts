type QueueItem<T> = {
  v: T;
  prev?: QueueItem<T>;
  next?: QueueItem<T>;
};

export class Queue<T> {
  _first?: QueueItem<T>;
  first() {
    return this._first?.v!;
  }
  _last?: QueueItem<T>;
  last() {
    return this._last?.v!;
  }
  len = 0;
  push(it: T) {
    this.len++;
    const { _last: last } = this;
    const item = { v: it } as QueueItem<T>;
    if (!last) {
      this._first = this._last = item;
      return;
    }
    item.prev = this._last!;
    last.next = item;
    this._last = item;
  }
  shift() {
    const { _first: first } = this;
    if (!first) return undefined;
    this.len--;

    const { next } = first;
    first.next = undefined;

    if (next) {
      next.prev = undefined;
    } else {
      this._last = undefined;
    }

    this._first = next;
    return first.v;
  }
}

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

export const genKey = (v: string|number) => `${v}-${Date.now()}-${Math.random()}` as unknown as number

export class SortMap<T> {
  data: Record<string | symbol, T[]> = {};
  clear() {
    this.data = {};
  }
  add(key: string | symbol, value: T) {
    const { data } = this;
    let list = data[key];
    if (!list) {
      list = [];
      data[key] = list;
    }
    list.push(value);
  }
}

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
