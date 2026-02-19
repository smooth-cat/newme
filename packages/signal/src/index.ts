import { evt, G, State } from './global';
import { Scheduler } from './schedule';
import { dispose } from './scope';
import { Signal } from './signal';
import { Getter, Mix, ValueDiff } from './type';

export { Scheduler, scheduler } from './schedule';
export { TaskQueue } from './task';
export { runWithPulling, clean } from './scope'
export * from './type';

const DefaultCustomSignalOpt = {
  scheduler: Scheduler.Sync,
  isScope: false
};
export type CustomSignalOpt = Partial<typeof DefaultCustomSignalOpt>;

export type CreateSignal = {
  <T extends (...args: any[]) => any>(get: T, opt?: CustomSignalOpt): Mix<ReturnType<T>>;
  <T = any>(value: T, opt?: CustomSignalOpt): Mix<T>;
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
  const bound = s.run.bind(s);
  bound.ins = s;
  Object.defineProperty(bound, 'v', {
    get() {
      return s.get();
    },
    set(v) {
      return s.set(v);
    }
  });
  return bound as any;
};

export const watch = (values: Getter[], watcher: (...args: ValueDiff[]) => void, opt: CustomSignalOpt = {}) => {
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
        watcher(...vs)
        s.state &= ~State.LinkScopeOnly;
      }
      mounted = true;
    },
    scheduler: Scheduler.Sync,
    isScope: true,
    ...opt
  });

  s.get();
  const bound = dispose.bind(s);
  bound.ins = s;
  return bound;
};

export const effect = (customPull: () => void, opt: CustomSignalOpt = {}) => {
  const s = Signal.create(null, {
    customPull,
    scheduler: Scheduler.Sync,
    isScope: true,
    ...opt
  });

  s.get();
  const bound = dispose.bind(s);
  bound.ins = s;
  return bound;
};

export const scope = (customPull: () => void) => {
  const s = Signal.create(null, {
    customPull,
    scheduler: Scheduler.Sync,
    isScope: true
  });

  s.get();
  s.state |= State.ScopeReady;

  const bound = dispose.bind(s);
  bound.ins = s;
  return bound;
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
/**
 * 数据变化时，自定义 触发订阅函数的时机
 * @param {CustomSignalOpt} opt 配置如下:
 * @prop scheduler: (runIfDirty, effect) => void 执行 runIfDirty 定制触发 effect 时机
 * @prop scope: 用于统一释放 effect link 的作用域 默认是 defaultScope 可以全局获取
 */
export const customWatch = (opt?: CustomSignalOpt) => {
  return ((init: any, innerOpt: any = {}) => {
    return watch(init, { ...opt, ...innerOpt });
  }) as typeof watch;
};
// const globalSignal = $(10);

// let outerA, outerB, innerX, innerY, outerResult, innerResult, innerDispose;

// const outerDispose = scope(() => {
//   outerA = $(1);
//   outerB = $(2);

//   // 外层计算信号
//   outerResult = $(() => {
//     const res = globalSignal.v + outerA.v + outerB.v;
//     return res;
//   });

//   innerDispose = scope(() => {
//     innerX = $(3);
//     innerY = $(4);

//     // 内层计算信号，既依赖内层也依赖外层信号
//     innerResult = $(() => {
//       const res = outerA.v + innerX.v + innerY.v;
//       return res;
//     });

//     // 访问信号以建立依赖关系
//     innerResult();
//   });

//   // 访问外层信号
//   outerResult();

//   // 将内层dispose函数绑定到外层scope，这样可以测试嵌套行为
//   (outerResult as any).innerDispose = innerDispose;
// });
// outerA.v = 5;
// innerX.v = 6;
// globalSignal.v = 20;
// // 先释放内层scope
// innerDispose();

// innerX.v = 7;
// outerA.v = 8;

// outerDispose();

// evt.on('one', ({ index }) => {
//   switch (index) {
//     case 0:
//       console.log({ index });
//       break;
//     case 1:
//       console.log({ index });
//     default:
//       break;
//   }
// });
