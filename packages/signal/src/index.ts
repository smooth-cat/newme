import { G, State } from './global';
import { Scheduler } from './schedule';
import { dispose, runWithPulling } from './scope';
import { Signal } from './signal';
import { CreateScope, Dispose, Getter, Mix, SignalType, ValueDiff } from './type';
import { deepSignal } from './deep-signal';

export { Signal, batchEnd, batchStart } from './signal';
export { deepSignal, shareSignal } from './deep-signal';
export { Scheduler, registerScheduler } from './schedule';
export { TaskQueue } from './task';
export { runWithPulling, clean, setPulling, getPulling } from './scope';
export * from './store';
export * from './type';
export { toRaw } from './util';
const DefaultCustomSignalOpt = {
  /** 三种模式
   * 1. auto:   根据值类型自动判断 默认
   * 2. ref:    对任何值使用 {v: xxx} 进行包装
   * 3. proxy:  使用 proxy 进行包装
   */
  mode: 'auto' as SignalType,
  /** 是否深度响应式 */
  deep: true
};

const DefaultCustomEffectOpt = {
  scheduler: Scheduler.Sync,
  immediate: true,
  isScope: true
};

export type CustomSignalOpt = Partial<typeof DefaultCustomSignalOpt>;
export type CustomEffectOpt = Partial<typeof DefaultCustomEffectOpt>;

export type CreateSignal = {
  <T extends (...args: any[]) => any>(get: T, opt?: CustomSignalOpt): Signal<ReturnType<T>>;
  <T extends object>(value: T, opt?: CustomSignalOpt): T;
  <T = any>(value: T, opt?: CustomSignalOpt): Signal<T>;
};

export const $: CreateSignal = (init?: unknown, opt: CustomSignalOpt = {}) => {
  opt = { ...DefaultCustomSignalOpt, ...opt };
  let intiValue: any, customPull: Getter;
  if (typeof init === 'function') {
    intiValue = null;
    customPull = init as Getter;
  } else if (opt.mode !== 'ref' && typeof init === 'object' && init !== null) {
    return deepSignal(init, G.PullingSignal, opt.deep);
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

export const effect = (
  customPull: (...args: ValueDiff[]) => void,
  depOrOpt?: Signal<any>[] | CustomEffectOpt,
  opt?: CustomEffectOpt
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
    return bound as Dispose;
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

export const scope: CreateScope = (...args) => {
  const hasScope = args.length > 1;
  const s = Signal.create(null, {
    customPull: args[0],
    scheduler: Scheduler.Sync,
    isScope: true,
    scope: hasScope ? args[1] : G.PullingSignal
  });
  if (hasScope) {
    runWithPulling(() => {
      s.v;
    }, args[1]);
  } else {
    s.v;
  }
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
export const customEffect = (opt?: CustomEffectOpt) => {
  return ((init: any, innerOpt: any = {}) => {
    return effect(init, { ...opt, ...innerOpt });
  }) as typeof effect;
};

export const isSignal = (value: unknown): value is Signal => {
  return value instanceof Signal;
};

export const isScope = (value: any): boolean => {
  return value instanceof Signal;
};
