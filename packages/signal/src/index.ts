import { State } from './global';
import { Scheduler } from './schedule';
import { dispose } from './scope';
import { Signal } from './signal';
import { Dispose, Getter, Mix, ValueDiff } from './type';

export { Scheduler, scheduler } from './schedule';
export { TaskQueue } from './task';
export { runWithPulling, clean } from './scope';
export * from './type';

const DefaultCustomSignalOpt = {
  scheduler: Scheduler.Sync,
  isScope: false,
  immediate: true
};
export type CustomSignalOpt = Partial<typeof DefaultCustomSignalOpt>;

export type CreateSignal = {
  <T extends (...args: any[]) => any>(get: T, opt?: CustomSignalOpt): Signal<ReturnType<T>>;
  <T = any>(value: T, opt?: CustomSignalOpt): Signal<T>;
};

export const $: CreateSignal = (init?: unknown) => {
  let intiValue: any, customPull: Getter;
  if (init instanceof Function) {
    intiValue = null;
    customPull = init as Getter;
  } else {
    intiValue = init;
  }
  const s = Signal.create(intiValue, {
    scheduler: Scheduler.Sync,
    isScope: false,
    customPull
  });

  return s;
};

/** @deprecated */
const watch = (values: Getter[], watcher: (...args: ValueDiff[]) => void, opt: CustomSignalOpt = {}) => {
  let mounted = false;
  const vs: ValueDiff[] = Array.from({ length: values.length }, () => ({ old: null, val: null }));
  const s = Signal.create(null, {
    customPull() {
      for (let i = 0; i < values.length; i++) {
        const value = values[i]();
        vs[i].old = vs[i].val;
        vs[i].val = value;
      }

      if (mounted) {
        s.state |= State.LinkScopeOnly;
        watcher(...vs);
        s.state &= ~State.LinkScopeOnly;
      }
      mounted = true;
    },
    scheduler: Scheduler.Sync,
    isScope: true,
    ...opt
  });

  s.v;
  const bound = dispose.bind(s);
  bound.ins = s;
  return bound;
};

export const effect = (
  customPull: (...args: ValueDiff[]) => void,
  depOrOpt?: Signal<any>[] | CustomSignalOpt,
  opt?: CustomSignalOpt
) => {
  /*----------------- 自动收集 -----------------*/
  const hasDep = Array.isArray(depOrOpt);
  opt = hasDep ? opt || {} : depOrOpt || {};
  // 立即执行
  if (!hasDep) {
    const s = Signal.create(null, {
      customPull,
      scheduler: Scheduler.Sync,
      isScope: true,
      ...opt
    });

    s.v;
    const bound = dispose.bind(s);
    bound.ins = s;
    return bound;
  }

  /*----------------- 指定依赖， watcher -----------------*/
  let mounted = false;
  const deps = depOrOpt as Signal[];
  const immediate = deps.length === 0 ? true : (opt.immediate ?? true);
  const vs: ValueDiff[] = Array.from({ length: deps.length }, () => ({ old: null, val: null }));
  const s = Signal.create(null, {
    customPull() {
      for (let i = 0; i < deps.length; i++) {
        const value = deps[i].v;
        vs[i].old = vs[i].val;
        vs[i].val = value;
      }

      if (mounted || immediate) {
        s.state |= State.LinkScopeOnly;
        customPull(...vs);
        s.state &= ~State.LinkScopeOnly;
      }
      mounted = true;
    },
    scheduler: Scheduler.Sync,
    isScope: true,
    ...opt
  });

  s.v;
  const bound = dispose.bind(s);
  bound.ins = s;
  return bound as Dispose;
};

export const scope = (customPull: () => void) => {
  const s = Signal.create(null, {
    customPull,
    scheduler: Scheduler.Sync,
    isScope: true
  });

  s.v;
  s.state |= State.ScopeReady;

  const bound = dispose.bind(s);
  bound.ins = s;
  return bound as Dispose;
};

/**
 * 数据变化时，自定义 触发订阅函数的时机
 * @param {CustomSignalOpt} opt 配置如下:
 * @prop scheduler: (runIfDirty, effect) => void 执行 runIfDirty 定制触发 effect 时机
 * @prop scope: 用于统一释放 effect link 的作用域 默认是 defaultScope 可以全局获取
 */
export const customEffect = (opt?: CustomSignalOpt) => {
  return ((init: any, innerOpt: any = {}) => {
    return effect(init, { ...opt, ...innerOpt });
  }) as typeof effect;
};
