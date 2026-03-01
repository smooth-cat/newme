import { isNatureNumStr } from 'bobe-shared';
import { G, rawToProxy } from './global';
import { Scheduler } from './schedule';
import { runWithPulling } from './scope';
import { Signal } from './signal';
import { Keys } from './type';
import { toRaw } from './util';
import { batch } from './batch-set';

export const deepSignal = <T>(target: T, scope: Signal, deep = true) => {
  const isObj = typeof target === 'object' && target !== null;
  // 1. 不是对象则返回原始值
  if (!isObj || target[Keys.Raw]) return target;
  // 2. 返回已有代理
  if (rawToProxy.has(target)) return rawToProxy.get(target);

  // 每个对象维护自己的 cells 闭包
  const cells = new Map<any, Signal>();
  const targetIsArray = Array.isArray(target);

  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      switch (prop) {
        case Keys.Raw:
          return target;
        case Keys.Deep:
          return deep;
        case Keys.Scope:
          return scope;
        default:
          break;
      }

      // 创建 Signal
      const value = Reflect.get(obj, prop, receiver);

      const valueIsFn = typeof value === 'function';
      if (valueIsFn) {
        if (targetIsArray) {
          return arrayMethodReWrites[prop] || value;
        } else {
          return value;
        }
      }

      // 已有对应 Signal
      if (cells.has(prop)) {
        return cells.get(prop).v;
      }

      const wrappedValue = deep ? deepSignal(value, scope) : value;
      const s = Signal.create(wrappedValue, {
        scheduler: Scheduler.Sync,
        isScope: false,
        scope
      });
      cells.set(prop, s);
      return s.v;
    },

    set(obj, prop, value, receiver) {
      // 数组项 set 可能出现 Iterator 设置，用 batch 避免 effect 多次执行
      batch.start();
      const success = Reflect.set(obj, prop, value, receiver);
      // 已有对应 Signal，更新 signal 值
      if (cells.has(prop)) {
        const cell = cells.get(prop);
        cell.v = deep ? deepSignal(value, scope) : value;
      }

      if (targetIsArray) {
        handleArraySet(obj, prop, value, receiver);
      }
      batch.end();
      // 保持原始对象干净
      return success;
    },

    // 【核心修改】拦截 delete 操作
    deleteProperty(obj, prop) {
      if (cells.has(prop)) {
        // 2. 从 Map 中移除，切断引用，允许 GC 回收这个 $() 实例
        cells.delete(prop);
      }
      return Reflect.deleteProperty(obj, prop);
    },

    ownKeys(obj) {
      if (targetIsArray) {
        // @ts-ignore
        proxy.length;
      } else {
        proxy[Keys.Iterator];
      }
      return Reflect.ownKeys(obj);
    }
  });

  rawToProxy.set(target, proxy);
  return proxy;
};

function handleArraySet(arr: object, prop: string | symbol, value: any, receiver: any) {
  // 设置 length
  if (prop === 'length') {
  }
  // 设置 index，由于 includes 等方法不对 index 再做监听，通过 Keys.Iterator 来保证副作用正确执行
  else if (isNatureNumStr(prop)) {
    receiver[Keys.Iterator] = (arr[Keys.Iterator] || 0) + 1;
  }
  // 其他
  else {
  }
}

const arrayMethodReWrites: any = {};
/*----------------- 增删移 增加 __Iterator Set ✅ -----------------*/
['pop', 'push', 'shift', 'splice', 'unshift', 'copyWithin', 'reverse', 'fill'].forEach(key => {
  arrayMethodReWrites[key] = function (...args: any[]) {
    batch.start();
    const fn = Array.prototype[key];
    // 不会进行依赖收集，但是会触发 set
    const res = runWithPulling(() => fn.call(this, ...args), null);
    this[Keys.Iterator] = (this[Keys.Raw][Keys.Iterator] || 0) + 1;
    batch.end();
    return res;
  };
});

/*----------------- 全等匹配 仅收集 __Iterator Get, 尝试使用原始或代理值再找一遍 ✅ -----------------*/
['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayMethodReWrites[key] = function (...args: any[]) {
    const fn = Array.prototype[key];
    const that = toRaw(this);
    let result = fn.call(that, ...args);
    const value = args[0];
    // 使用传入的值但是未找到，尝试使用代理值，或原始值查询
    if ((result === false || result === -1) && typeof value === 'object' && value !== null) {
      if (value[Keys.Raw]) {
        args[0] = value[Keys.Raw];
        result = fn.call(that, ...args);
      }
      if (rawToProxy.has(value)) {
        args[0] = rawToProxy.get(value);
        result = fn.call(that, ...args);
      }
    }
    // 增加 __Iterator Get
    this[Keys.Iterator];
    return result;
  };
});

/*----------------- 重写迭代器获取 仅收集 __Iterator Get, ✅ -----------------*/
// keys 不重写因为 array 的 keys 和 length 对等， length 不变 keys 也不变
[Symbol.iterator, 'values', 'entries'].forEach(key => {
  const isEntries = key === 'entries';
  arrayMethodReWrites[key] = function (...args: any[]) {
    const fn = Array.prototype[key];
    const rawArray = toRaw(this);
    const iter = fn.call(rawArray, ...args);
    const scope = this[Keys.Scope];
    const isDeep = this[Keys.Deep];
    // 深度代理需要将 iter.next 返回值转 proxy
    if (isDeep) {
      const rawNext = iter.next.bind(iter);
      iter.next = () => {
        const result = rawNext();
        if (!result.done) {
          if (isEntries) {
            result.value[1] = deepSignal(result.value[1], scope);
          } else {
            result.value = deepSignal(result.value, scope);
          }
        }
        return result;
      };
    }

    this[Keys.Iterator];

    return iter;
  };
});

/**
 * filter 函数的实现
 */
arrayMethodReWrites.filter = function (callback, thisArg) {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);
  const result = [];
  let resultIndex = 0;

  const userThis = thisArg || that;

  const len = that.length;
  for (let i = 0; i < len; i++) {
    // 使用 in 操作符检查索引是否存在
    // 原生 filter 会跳过空洞（比如 [1, , 3] 中的 index 1）
    if (i in that) {
      const value = isDeep ? deepSignal(that[i], scope) : that[i];
      // 性能点 3：直接调用回调，避免使用多余的包装
      if (callback.call(userThis, value, i, userThis)) {
        // 性能点 4：直接通过索引赋值，通常比 push() 略快
        result[resultIndex++] = value;
      }
    }
  }
  this[Keys.Iterator];
  return result;
};

arrayMethodReWrites.slice = function (start, end) {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];

  const that = toRaw(this);
  const len = that.length;

  // 1. 处理 start 参数
  let k = start || 0;
  if (k < 0) {
    k = Math.max(len + k, 0);
  } else {
    k = Math.min(k, len);
  }

  // 2. 处理 end 参数
  let final = end === undefined ? len : end;
  if (final < 0) {
    final = Math.max(len + final, 0);
  } else {
    final = Math.min(final, len);
  }

  // 3. 计算实际需要抽取的长度
  const count = Math.max(final - k, 0);

  // 4. 预分配数组空间以提升性能（针对大数组非常有效）
  // 现代引擎对于已知长度的数组初始化会有优化
  const result = new Array(count);

  // 5. 循环赋值
  for (let i = 0; i < count; i++) {
    // 确保处理稀疏数组的情况，保持与原生行为一致
    if (i + k in that) {
      result[i] = isDeep ? deepSignal(that[i + k], scope) : that[i + k];
    }
  }
  this[Keys.Iterator];
  return result;
};

arrayMethodReWrites.toReversed = function () {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);

  // 2. 获取数组长度（使用无符号右移保证为正整数，模拟规范中的 ToLength/ToUint32）
  const len = that.length;

  // 3. 创建等长的新数组
  // 预先分配内存空间比不断 push 性能更好
  const result = new Array(len);

  // 4. 填充新数组
  // 使用双指针或简单减法遍历。由于 O[i] 可能触发 getter，
  // 且我们需要处理稀疏数组，直接赋值 A[k] = O[j] 即可。
  let k = 0;
  while (k < len) {
    // 根据规范，toReversed 会读取索引值，如果索引不存在则为 undefined
    // 这会自动将稀疏数组的 hole 转为 undefined
    result[k] = isDeep ? deepSignal(that[len - 1 - k], scope) : that[len - 1 - k];
    k++;
  }

  this[Keys.Iterator];
  // 5. 返回结果
  return result;
};

arrayMethodReWrites.toSpliced = function (start, deleteCount, ...items) {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);

  const len = that.length;

  // 1. 确定实际的相对起始索引 (处理负数和越界)
  let relativeStart = start >> 0; // 快速取整
  let actualStart = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

  // 2. 确定实际删除的数量
  let actualDeleteCount;
  if (arguments.length === 0) {
    actualDeleteCount = 0;
  } else if (arguments.length === 1) {
    actualDeleteCount = len - actualStart;
  } else {
    let dc = deleteCount >> 0;
    actualDeleteCount = Math.min(Math.max(dc, 0), len - actualStart);
  }

  // 3. 计算新数组长度
  const insertCount = items.length;
  const newLen = len - actualDeleteCount + insertCount;
  const result = new Array(newLen);

  // 4. 填充新数组（分段式操作，性能最优）

  // 第一段：保留起始点之前的元素
  for (let i = 0; i < actualStart; i++) {
    result[i] = isDeep ? deepSignal(that[i], scope) : that[i];
  }

  // 第二段：插入新元素
  for (let i = 0; i < insertCount; i++) {
    result[actualStart + i] = isDeep ? deepSignal(items[i], scope) : items[i];
  }

  // 第三段：保留被删除部分之后的剩余元素
  const remainingStart = actualStart + actualDeleteCount;
  const resultOffset = actualStart + insertCount;
  for (let i = 0; i < len - remainingStart; i++) {
    result[resultOffset + i] = isDeep ? deepSignal(that[remainingStart + i], scope) : that[remainingStart + i];
  }

  this[Keys.Iterator];
  return result;
};

arrayMethodReWrites.with = function (index, value) {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);

  // 1. 获取数组长度（确保处理类数组对象）
  const len = that.length;

  // 2. 转换索引为整数（处理 undefined/NaN 等情况）
  let relativeIndex = Number(index) || 0;

  // 3. 处理负数索引逻辑
  let actualIndex = relativeIndex >= 0 ? relativeIndex : len + relativeIndex;

  // 4. 边界检查：如果索引越界，抛出 RangeError
  if (actualIndex >= len || actualIndex < 0) {
    throw new RangeError(`Invalid index: ${index}`);
  }

  // 5. 性能优化点：预分配数组空间
  // 使用 new Array(len) 配合循环在处理大数组且包含空位时，
  // 比 [...that] 或 slice() 更加符合规范对“稀疏转密集”的要求。
  const result = new Array(len);

  for (let i = 0; i < len; i++) {
    if (i === actualIndex) {
      result[i] = isDeep ? deepSignal(value, scope) : value;
    } else {
      result[i] = isDeep ? deepSignal(that[i], scope) : that[i];
    }
  }
  this[Keys.Iterator];
  return result;
};

arrayMethodReWrites.concat = function (...items) {
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);
  const selfLen = that.length; // 确保长度为正整数

  // 2. 预计算总长度以优化性能
  let totalLength = selfLen;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // 模拟原生 concat 的展开逻辑：只有数组会被展开
    if (Array.isArray(item)) {
      totalLength += item.length;
    } else {
      totalLength += 1;
    }
  }

  // 3. 创建结果数组（预设长度）
  const result = new Array(totalLength);
  let k = 0;

  // 4. 填充原数组数据
  for (; k < selfLen; k++) {
    if (k in that) {
      result[k] = isDeep ? deepSignal(that[k], scope) : that[k];
    }
  }

  // 5. 填充参数数据
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (Array.isArray(item)) {
      for (let j = 0; j < item.length; j++) {
        if (j in item) {
          result[k] = isDeep ? deepSignal(item[j], scope) : item[j];
        }
        k++;
      }
    } else {
      result[k] = isDeep ? deepSignal(item, scope) : item;
      k++;
    }
  }
  this[Keys.Iterator];
  return result;
};

/*----------------- 回调函数 仅收集 __Iterator Get，回调中收集用户 get -----------------*/
const GetMethodConf = {
  wrapReturn: false,
  wrapArgs: 0b01
};
[
  {
    key: 'every',
    ...GetMethodConf
  },
  {
    key: 'find',
    wrapReturn: true,
    ...GetMethodConf
  },
  {
    key: 'findLast',
    ...GetMethodConf,
    wrapReturn: true
  },
  {
    key: 'findIndex',
    ...GetMethodConf
  },
  {
    key: 'findLastIndex',
    ...GetMethodConf
  },
  {
    key: 'forEach',
    ...GetMethodConf
  },
  {
    key: 'map',
    ...GetMethodConf
  },
  {
    key: 'some',
    ...GetMethodConf
  },
  {
    key: 'reduce',
    ...GetMethodConf,
    wrapArgs: 0b10
  },
  {
    key: 'reduceRight',
    ...GetMethodConf,
    wrapArgs: 0b10
  }
].forEach(({ key, wrapReturn, wrapArgs }) => {
  arrayMethodReWrites[key] = function (...args: any[]) {
    const scope = this[Keys.Scope];
    const fn = Array.prototype[key];
    const isDeep = this[Keys.Deep];
    const that = toRaw(this);
    warpCallbackArgs(isDeep, args, scope, wrapArgs);
    // 遍历函数不收集数组属性
    let result = fn.call(that, ...args);
    if (wrapReturn && isDeep) {
      result = deepSignal(result, scope);
    }
    this[Keys.Iterator];
    return result;
  };
});

// TODO: 考虑是否基于 js 实现以提高性能
arrayMethodReWrites.toSorted = function (...args: any[]) {
  const fn = Array.prototype['toSorted'];
  const scope = this[Keys.Scope];
  const isDeep = this[Keys.Deep];
  const that = toRaw(this);
  warpCallbackArgs(isDeep, args, scope, 0b11);
  let result = fn.call(that, ...args);
  this[Keys.Iterator];
  return isDeep ? result.map(it => deepSignal(it, scope)) : result;
};

/*----------------- 转换方法 仅收集 仅收集 __Iterator Get -----------------*/
['join', 'toString', 'toLocaleString'].forEach(key => {
  arrayMethodReWrites[key] = function (...args: any[]) {
    const fn = Array.prototype[key];
    const that = toRaw(this);
    const result = fn.call(that, ...args);
    this[Keys.Iterator];
    return result;
  };
});

function warpCallbackArgs(isDeep: boolean, args: any[], scope: Signal, wrapArgs: number = 0b01) {
  const callback = args[0];
  const wrapCb = function (this: any, ...cbArgs: any[]) {
    if (isDeep) {
      if (wrapArgs & 0b01) cbArgs[0] = deepSignal(cbArgs[0], scope);
      if (wrapArgs & 0b10) cbArgs[1] = deepSignal(cbArgs[1], scope);
    }
    // 遍历函数不收集数组属性，但是回调函数需要收集用户的 get
    return callback.call(this, ...cbArgs);
  };
  args[0] = wrapCb;
}

// TODO: flat flatMap sort

/**
 * 无需重写：
 * 1. at
 * 2. keys
 */
