import { $, Dispose, effect, scope } from '../index';
import { Scheduler } from '../schedule';
import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';
import { ide } from '../util';
import { evt, G } from '../global';
import { Signal } from 'src/signal';
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  evt.clear();
  G.scopeDisposeI = 0;
});

describe('watch 功能测试', () => {
  it('基本 watch 功能 - 监听单一信号变化', () => {
    const log = new Log();
    const signal = $(1);

    const watcher = effect(
      () => {
        log.call('watcher执行');
      },
      [signal],
      { immediate: false }
    );

    const dep = new DepStr({ signal, watcher });
    dep.depIs(`
      signal -> watcher
    `);

    // 初始化阶段不应执行
    log.toBe();

    // 改变信号值，触发 watch
    signal.v = 2;
    log.toBe('watcher执行');

    // 再次改变，继续触发
    signal.v = 3;
    log.toBe('watcher执行');
  });

  it('监听多个信号变化', () => {
    const log = new Log();
    const signal1 = $(1);
    const signal2 = $(2);

    effect(
      () => {
        log.call(`watcher执行: ${signal1.v}, ${signal2.v}`);
      },
      [signal1, signal2],
      { immediate: false }
    );

    // 初始化不应执行
    log.toBe();

    // 改变第一个信号
    signal1.v = 10;
    log.toBe('watcher执行: 10, 2');

    // 改变第二个信号
    signal2.v = 20;
    log.toBe('watcher执行: 10, 20');
  });

  it('监听计算信号变化', () => {
    const log = new Log();
    const source = $(5);
    const multiplier = $(2);
    const computed = $(() => source.v * multiplier.v);

    effect(
      () => {
        log.call(`computed变化: ${computed.v}`);
      },
      [computed],
      { immediate: false }
    );

    // 初始化不应执行
    log.toBe();

    // 改变源信号，触发计算信号变化，从而触发 watch
    source.v = 10; // computed 变为 20
    log.toBe('computed变化: 20');

    // 改变乘数，也触发计算信号变化
    multiplier.v = 3; // computed 变为 30
    log.toBe('computed变化: 30');
  });

  it('监听复杂依赖链的变化', () => {
    const log = new Log();
    const a = $(1);
    const b = $(2);
    const sum = $(() => a.v + b.v);
    const product = $(() => sum.v * 2);

    effect(
      () => {
        log.call(`product变化: ${product.v}`);
      },
      [product],
      { immediate: false }
    );

    // 初始化不应执行
    log.toBe();

    // 改变 a，触发整个依赖链
    a.v = 3; // sum=5, product=10
    log.toBe('product变化: 10');

    // 改变 b，同样触发依赖链
    b.v = 4; // sum=7, product=14
    log.toBe('product变化: 14');
  });

  it('使用 DepStr 验证 watch 建立的依赖关系', () => {
    const log = new Log();
    const signal1 = $(1);
    const signal2 = $(3);
    const computed = $(() => signal1.v * signal2.v);

    let watcherExecuted = false;
    const watcher = effect(
      () => {
        log.call('watcher执行');
        watcherExecuted = true;
      },
      [computed],
      { immediate: false }
    );

    // 验证依赖关系已建立
    const depStr = new DepStr({ signal1, signal2, computed, watcher });
    depStr.depIs(`
      signal1 -> computed -> watcher
      signal2 -> computed -> watcher
    `);

    // 初始执行后，watcher 应该还未执行
    expect(watcherExecuted).toBe(false);

    // 改变依赖项，触发 watch
    signal1.v = 2; // computed 变为 6
    log.toBe('watcher执行');
    expect(watcherExecuted).toBe(true);
  });

  it('watch 不应响应未监听的信号变化', () => {
    const log = new Log();
    const watchedSignal = $(1);
    const unwatchedSignal = $(10);

    effect(
      () => {
        log.call(`watcher执行${unwatchedSignal.v}`);
      },
      [watchedSignal],
      { immediate: false }
    );

    // 初始化不应执行
    log.toBe();

    // 改变被监听的信号
    watchedSignal.v = 2;
    log.toBe('watcher执行10');

    // 改变未被监听的信号，不应触发 watch
    unwatchedSignal.v = 20;
    log.toBe(); // 没有新的执行
  });

  it('使用不同调度器的 watch', done => {
    const log = new Log();
    const signal = $(1);

    effect(
      () => {
        log.call('async watcher执行');
      },
      [signal],
      { immediate: false, scheduler: Scheduler.Micro }
    );

    // 初始化不应执行
    log.toBe();

    // 改变信号，但因为使用 Micro 调度器，需要等待
    signal.v = 2;
    log.toBe(); // 还没有执行

    // 等待微任务执行
    Promise.resolve().then(() => {
      log.toBe('async watcher执行');
      done();
    });
  });

  it('使用 scope 取消监听', done => {
    const log = new Log();
    const signal = $(1);
    let watcher: any;
    const dispose = scope(() => {
      watcher = effect(
        () => {
          log.call('watcher执行');
        },
        [signal],
        { immediate: false }
      );
    });
    const str = new DepStr({
      signal,
      watcher,
      dispose
    });

    str.depIs(`
      signal -> watcher -> dispose   
    `);

    // 改变信号值，触发 watch
    signal.v = 2;
    log.toBe('watcher执行');

    // 调用 dispose 函数来取消监听
    dispose();
    str.depIs(`watcher -> dispose`);
    // 在取消监听后改变信号，不应该再触发 watch
    signal.v = 3;
    log.toBe();
    // 通过 scope 嫩自动找出外部依赖并断开
    ide(() => {
      str.depIs(`watcher -> dispose`);
      done();
    });
    jest.runAllTimers();
  });

  it(' dispose 功能测试', () => {
    const log = new Log();
    const signal = $(1);

    const watcher = effect(
      () => {
        log.call('watcher执行');
      },
      [signal],
      { immediate: false }
    );

    const dep = new DepStr({ signal, watcher });

    // 初始状态应该正常工作
    signal.v = 2;
    log.toBe('watcher执行');
    dep.depIs(`
      signal -> watcher
      `);

    // 停止监听
    watcher();

    dep.depIs(``);

    // 改变信号值，不应该触发监听器
    signal.v = 3;
    log.toBe(); // 没有新的执行

    // 再次改变信号值，仍然不应该触发监听器
    signal.v = 4;
    log.toBe(); // 没有新的执行
  });

  it('监听多个信号时的新旧值比较', () => {
    const log = new Log();
    const signal1 = $(1);
    const signal2 = $(2);

    effect(
      (...args) => {
        const valueDiffs = args;
        log.call(
          `新值=${JSON.stringify(valueDiffs.map(v => v.val))}, 旧值=${JSON.stringify(valueDiffs.map(v => v.old))}`
        );
      },
      [signal1, signal2],
      { immediate: false }
    );

    // 初始化不应执行
    log.toBe();

    // 改变第一个信号
    signal1.v = 10;
    log.toBe('新值=[10,2], 旧值=[1,2]');

    // 改变第二个信号
    signal2.v = 20;
    log.toBe('新值=[10,20], 旧值=[10,2]');

    // 同时改变两个信号
    signal1.v = 100;
    signal2.v = 200;
    log.toBe('新值=[100,20], 旧值=[10,20]', '新值=[100,200], 旧值=[100,20]');
  });

  it('stop 功能对微任务 watcher 的停止', done => {
    const log = new Log();
    const signal = $(1);

    const watcher = effect(
      () => {
        log.call('micro task watcher执行');
      },
      [signal],
      { immediate: false, scheduler: Scheduler.Micro }
    );

    // 初始状态，改变信号会触发微任务执行
    signal.v = 2;
    log.toBe(); // 微任务还未执行
    watcher();

    Promise.resolve().then(() => {
      log.toBe(); // 因为停止了，所以没有执行
      done();
    });
  });

  it('两层 watch 嵌套 - 第一层监听全局 signal，在回调中嵌套第二层 watch 监听内部 signal', () => {
    const log = new Log();
    const globalSignal1 = $(1);
    const globalSignal2 = $(10);
    const globalSignalForInner = $('for inner');
    let innerSignal: Signal;
    let innerWatcher: Dispose;

    // 第一层 watch：监听全局 signal1，并在回调中创建第二层 watch
    const outWatcher = effect(
      () => {
        const currentValue = globalSignal1.v;
        const anotherValue = globalSignal2.v; // 使用另一个全局 signal
        innerSignal = $(currentValue * anotherValue); // 创建内部 signal

        log.call(
          `第一层 watch 执行: globalSignal1=${currentValue}, globalSignal2=${anotherValue}, innerSignal=${innerSignal.v}`
        );

        // 第二层 watch：嵌套在第一层回调中，监听内部 signal
        innerWatcher = effect(
          ({ val: innerVal }, { val: globalVal }) => {
            log.call(`第二层 watch 执行: innerSignal=${innerVal} forInner=${globalVal}`);
          },
          [innerSignal, globalSignalForInner],
          { immediate: false }
        );
      },
      [globalSignal1],
      { immediate: false }
    );

    /*----------------- 初始化阶段-----------------*/
    log.toBe();
    new DepStr({ globalSignal1, outWatcher })
      // 没执行所以此时依赖只有一个
      .depIs(`globalSignal1 -> outWatcher`)
      // outWatcher 与 globalSignal1 统计，非外部 signal，即无外部引用
      .outLinkIs(outWatcher, '');

    /*----------------- 改变第一层监听的信号，触发第一层 watch，进而创建第二层 watch -----------------*/
    globalSignal1.v = 2;
    log.toBe('第一层 watch 执行: globalSignal1=2, globalSignal2=10, innerSignal=20');
    new DepStr({ globalSignalForInner, globalSignal1, globalSignal2, innerSignal, innerWatcher, outWatcher })
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner')
      .outLinkIs(innerWatcher, '');

    /*----------------- 再次改变第一层监听的信号，会重新创建第二层 watch -----------------*/
    const memoInnerSignal = innerSignal;
    const memoInnerWatcher = innerWatcher;
    globalSignal1.v = 3;
    log.toBe('第一层 watch 执行: globalSignal1=3, globalSignal2=10, innerSignal=30');
    /**
     * 1. innerWatcher 被 dispose，其引用的 signal 遵循孤岛释放原则，
     * 2. innerWatcher 没有外部引用
     */
    const dep = new DepStr({
      memoInnerSignal,
      memoInnerWatcher,
      innerSignal,
      innerWatcher,
      outWatcher,
      globalSignal1,
      globalSignal2,
      globalSignalForInner
    })
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner');

    // 此时 innerSignal 为 30，改变它会触发第二层 watch

    innerSignal.v = 50;
    log.toBe('第二层 watch 执行: innerSignal=50 forInner=for inner');

    // 依赖树没变
    dep
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner');

    // 释放 innerWatcher
    innerWatcher();
    dep.depIs(`globalSignal1 -> outWatcher`).outLinkIs(outWatcher, '');

    // 释放 outWatcher
    outWatcher();
    dep.depIs(``).outLinkIs(outWatcher, '');
  });

  it('两层 watch 嵌套 先释放外层', () => {
    const log = new Log();
    const globalSignal1 = $(1);
    const globalSignal2 = $(10);
    const globalSignalForInner = $('for inner');
    let innerSignal: any;
    let innerWatcher: any;

    // 第一层 watch：监听全局 signal1，并在回调中创建第二层 watch
    const outWatcher = effect(
      () => {
        const currentValue = globalSignal1.v;
        const anotherValue = globalSignal2.v; // 使用另一个全局 signal
        innerSignal = $(currentValue * anotherValue); // 创建内部 signal

        log.call(
          `第一层 watch 执行: globalSignal1=${currentValue}, globalSignal2=${anotherValue}, innerSignal=${innerSignal.v}`
        );

        // 第二层 watch：嵌套在第一层回调中，监听内部 signal
        innerWatcher = effect(
          ({ val: innerVal }, { val: globalVal }) => {
            log.call(`第二层 watch 执行: innerSignal=${innerVal} forInner=${globalVal}`);
          },
          [innerSignal, globalSignalForInner],
          { immediate: false }
        );
      },
      [globalSignal1],
      { immediate: false }
    );

    /*----------------- 初始化阶段-----------------*/
    log.toBe();
    new DepStr({ globalSignal1, outWatcher })
      // 没执行所以此时依赖只有一个
      .depIs(`globalSignal1 -> outWatcher`)
      // outWatcher 与 globalSignal1 统计，非外部 signal，即无外部引用
      .outLinkIs(outWatcher, '');

    /*----------------- 改变第一层监听的信号，触发第一层 watch，进而创建第二层 watch -----------------*/
    globalSignal1.v = 2;
    log.toBe('第一层 watch 执行: globalSignal1=2, globalSignal2=10, innerSignal=20');
    new DepStr({ globalSignalForInner, globalSignal1, globalSignal2, innerSignal, innerWatcher, outWatcher })
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner')
      .outLinkIs(innerWatcher, '');

    /*----------------- 再次改变第一层监听的信号，会重新创建第二层 watch -----------------*/
    const memoInnerSignal = innerSignal;
    const memoInnerWatcher = innerWatcher;
    globalSignal1.v = 3;
    log.toBe('第一层 watch 执行: globalSignal1=3, globalSignal2=10, innerSignal=30');
    /**
     * 1. innerWatcher 被 dispose，其引用的 signal 遵循孤岛释放原则，
     * 2. innerWatcher 没有外部引用
     */
    const dep = new DepStr({
      memoInnerSignal,
      memoInnerWatcher,
      innerSignal,
      innerWatcher,
      outWatcher,
      globalSignal1,
      globalSignal2,
      globalSignalForInner
    })
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner');

    // 此时 innerSignal 为 30，改变它会触发第二层 watch

    innerSignal.v = 50;
    log.toBe('第二层 watch 执行: innerSignal=50 forInner=for inner');

    // 依赖树没变
    dep
      .depIs(
        `
        globalSignal1 -> outWatcher
        innerSignal -> innerWatcher -> outWatcher
        globalSignalForInner -> innerWatcher
      `
      )
      .outLinkIs(outWatcher, 'globalSignalForInner');

    // 释放 outWatcher innerSignal -> innerWatcher 不打断，由 State.ScopeAbort 控制不执行
    outWatcher();
    dep.depIs(`innerSignal -> innerWatcher -> outWatcher`).outLinkIs(outWatcher, '');

    // 释放 innerWatcher
    innerWatcher();
    dep.depIs(``).outLinkIs(outWatcher, '');
  });
});
