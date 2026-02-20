import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';
import { $, effect, scope } from '../index';

describe('scope + signal 测试', () => {
  it('孤岛引用回收', () => {
    const log = new Log();
    const B = $(1);
    let a, c, d, b;
    const dispose = scope(() => {
      a = $(true);
      b = $(() => B.v);
      c = $(2);

      d = $(() => {
        const res = a.v ? b.v : c.v;
        log.call(`d是${res}`);
        return res;
      });
      d.v;
    });
    const str = new DepStr({ a, b, B, c, d, scope: dispose });
    /*----------------- 初始依赖链 -----------------*/
    log.toBe('d是1');
    str.depIs(`
      a -> d -> scope
      B -> b -> d
    `);
    str.outLinkIs(dispose, 'B');

    /*----------------- 单引用链 B -> b 直接被删除 -----------------*/
    a.v = false;
    str.depIs(`
      a -> d -> scope
      c -> d
    `);
    log.toBe('d是2');

    /*----------------- 禁用后不再拉取值，使用最后一次缓存的值 -----------------*/
    dispose();
    a.v = true;
    log.toBe();
    expect(d.v).toBe(2);
    str.depIs(``); // d 是 scope 下单一依赖链，整条链全部被打断
    str.outLinkIs(dispose, '');
  });

  it('嵌套 scope 的依赖管理和释放', () => {
    const log = new Log();

    let globalSignal = $(10),
      outerDispose,
      outerA,
      outerB,
      outerResult,
      innerDispose,
      innerX,
      innerY,
      innerResult;

    outerDispose = scope(() => {
      outerA = $(1);
      outerB = $(2);

      // 外层计算信号
      outerResult = $(() => {
        const res = globalSignal.v + outerA.v + outerB.v;
        log.call(`outerResult: ${res}`);
        return res;
      });

      innerDispose = scope(() => {
        innerX = $(3);
        innerY = $(4);

        // 内层计算信号，既依赖内层也依赖外层信号
        innerResult = $(() => {
          const res = outerA.v + innerX.v + innerY.v;
          log.call(`innerResult: ${res}`);
          return res;
        });

        // 访问信号以建立依赖关系
        innerResult.v;
      });

      // 访问外层信号
      outerResult.v;

      // 将内层dispose函数绑定到外层scope，这样可以测试嵌套行为
      (outerResult as any).innerDispose = innerDispose;
    });
    /*----------------- 初始依赖链 -----------------*/
    const depStr = new DepStr({
      outerScope: outerDispose,
      innerScope: innerDispose,
      globalSignal,
      outerA,
      outerB,
      innerX,
      innerY,
      outerResult,
      innerResult
    });
    depStr.depIs(`
      globalSignal -> outerResult -> outerScope
      outerA -> outerResult
      outerB -> outerResult
      outerA -> innerResult -> innerScope -> outerScope
      innerX -> innerResult
      innerY -> innerResult
      `);
    // innerScope 使用了 innerResult()，两者 scope 不同
    // innerScope.scope 是 outerScope，所以 outScope 才具有外链 innerResult，合理
    depStr.outLinkIs(outerDispose, 'globalSignal innerResult');
    depStr.outLinkIs(innerDispose, 'outerA');
    log.toBe('innerResult: 8', 'outerResult: 13'); // inner: 1+3+4=8, outer: 10+1+2=13

    /*----------------- 验证计算结果 -----------------*/
    // 修改外层信号，观察影响
    outerA.v = 5;
    log.toBe('innerResult: 12', 'outerResult: 17'); // inner: 5+3+4=12, outer: 10+5+2=17

    // 修改内层信号，观察影响
    innerX.v = 6;
    log.toBe('innerResult: 15'); // inner: 5+6+4=15

    // 修改外部信号，观察影响
    globalSignal.v = 20;
    log.toBe('outerResult: 27'); // outer: 20+5+2=27

    /*----------------- 释放 innerScope -----------------*/
    innerDispose();
    depStr.depIs(`
      globalSignal -> outerResult -> outerScope
      outerA -> outerResult
      outerB -> outerResult
    `);
    depStr.outLinkIs(innerDispose, '');
    /**
     * 'globalSignal innerResult' => 'globalSignal'
     * 因为 innerResult 释放时打断了 innerResult -> innerScope
     * outerDispose 的外链 innerResult 被回收
     */
    depStr.outLinkIs(outerDispose, 'globalSignal');
    innerX.v = 7; // 释放后，内部信号不再响应变化
    log.toBe(); // 没有输出，因为内层scope已释放

    outerA.v = 8; // 外部信号仍应正常工作
    log.toBe('outerResult: 30'); // outer: 20+8+2=30

    /*----------------- 释放 outerScope -----------------*/
    outerDispose();
    depStr.depIs(``);
    depStr.outLinkIs(outerDispose, '');

    // 释放外层后，所有都不应再响应变化
    outerA.v = 9;
    globalSignal.v = 30;
    log.toBe(); // 没有任何输出
  });

  it('嵌套 scope - 外部先释放，内部自动释放', () => {
    const log = new Log();
    const globalSignal = $(10);

    let outerA, outerB, innerX, innerY, outerResult, innerResult, innerDispose;

    const outerDispose = scope(() => {
      outerA = $(1);
      outerB = $(2);

      // 外层计算信号
      outerResult = $(() => {
        const res = globalSignal.v + outerA.v + outerB.v;
        log.call(`outerResult: ${res}`);
        return res;
      });

      innerDispose = scope(() => {
        innerX = $(3);
        innerY = $(4);

        // 内层计算信号，既依赖内层也依赖外层信号
        innerResult = $(() => {
          const res = outerA.v + innerX.v + innerY.v;
          log.call(`innerResult: ${res}`);
          return res;
        });

        // 访问信号以建立依赖关系
        innerResult.v;
      });

      // 访问外层信号
      outerResult.v;
    });

    /*----------------- 初始依赖链 -----------------*/
    const depStr = new DepStr({
      outerScope: outerDispose,
      innerScope: innerDispose,
      globalSignal,
      outerA,
      outerB,
      innerX,
      innerY,
      outerResult,
      innerResult
    });
    depStr.depIs(`
      globalSignal -> outerResult -> outerScope
      outerA -> outerResult
      outerB -> outerResult
      outerA -> innerResult -> innerScope -> outerScope
      innerX -> innerResult
      innerY -> innerResult
    `);
    depStr.outLinkIs(outerDispose, 'globalSignal innerResult');
    depStr.outLinkIs(innerDispose, 'outerA');
    log.toBe('innerResult: 8', 'outerResult: 13'); // inner: 1+3+4=8, outer: 10+1+2=13

    /*----------------- 验证计算结果 -----------------*/
    // 修改外层信号，观察影响
    outerA.v = 5;
    log.toBe('innerResult: 12', 'outerResult: 17'); // inner: 5+3+4=12, outer: 10+5+2=17

    // 修改内层信号，观察影响
    innerX.v = 6;
    log.toBe('innerResult: 15'); // inner: 5+6+4=15

    // 修改外部信号，观察影响
    globalSignal.v = 20;
    log.toBe('outerResult: 27'); // outer: 20+5+2=27

    /*----------------- 先释放 outerScope (这应该自动释放 innerScope) -----------------*/
    outerDispose();
    depStr.outLinkIs(outerDispose, '');
    depStr.outLinkIs(innerDispose, '');

    // 外层释放后，内外层的计算都不应该再响应变化
    log.toBe(); // 没有新的输出

    // 此时外部信号的依赖已经被清理，内部和外部scope都已释放
    globalSignal.v = 20;
    outerA.v = 8;
    log.toBe(); // 仍然没有输出

    // 修改内部信号，也不应该有反应
    innerX.v = 7;
    innerY.v = 8;
    log.toBe(); // 仍然没有输出

    // 检查依赖链状态 - 应该全部被清理
    depStr.depIs(`innerScope -> outerScope`);

    // 验证 signal 在 dispose 后返回缓存值
    expect(outerResult.v).toBe(27); // 最后一次计算的值
    expect(innerResult.v).toBe(15); // 最后一次计算的值
    expect(outerA.v).toBe(5); // 最后设置的值
    expect(globalSignal.v).toBe(20); // 最后设置的值
  });
});

describe('scope + effect 测试', () => {
  it('孤岛引用 effect 回收', () => {
    const log = new Log();
    const B = $(1);
    let a, c, ef, b;
    const dispose = scope(() => {
      a = $(true);
      b = $(() => B.v);
      c = $(2);

      ef = effect(() => {
        const res = a.v ? b.v : c.v;
        log.call(`d是${res}`);
      });
    });
    /*----------------- 初始依赖链 -----------------*/
    const str = new DepStr({ a, b, B, c, ef, scope: dispose });
    str.depIs(`
      a -> ef -> scope
      B -> b -> ef
    `);
    str.outLinkIs(dispose, 'B');
    log.toBe('d是1');

    /*----------------- 单引用链 B -> b 直接被删除 -----------------*/
    a.v = false;
    str.depIs(`
      a -> ef -> scope
      c -> ef
    `);
    str.outLinkIs(dispose, '');
    log.toBe('d是2');

    /*----------------- 还原到初始状态依赖链 -----------------*/
    a.v = true;
    str.depIs(`
      a -> ef -> scope
      B -> b -> ef
    `);
    str.outLinkIs(dispose, 'B');
    log.toBe('d是1');

    /*----------------- 外部引用 B -> b 被删除, scope 内的 link 不用打断 -----------------*/
    dispose();
    a.v = false;
    log.toBe();
    str.depIs(`
      a -> ef -> scope
      b -> ef
    `);
    str.outLinkIs(dispose, '');
  });

  it('嵌套 scope 的依赖管理和释放 (使用 effect)', () => {
    const log = new Log();
    const globalSignal = $(10);

    let outerA, outerB, innerX, innerY, outerEffect, innerEffect, innerDispose;

    const outerDispose = scope(() => {
      outerA = $(1);
      outerB = $(2);

      // 外层 effect
      outerEffect = effect(() => {
        const res = globalSignal.v + outerA.v + outerB.v;
        log.call(`outerResult: ${res}`);
      });

      innerDispose = scope(() => {
        innerX = $(3);
        innerY = $(4);

        // 内层 effect，既依赖内层也依赖外层信号
        innerEffect = effect(() => {
          const res = outerA.v + innerX.v + innerY.v;
          log.call(`innerResult: ${res}`);
        });
      });
    });

    /*----------------- 初始依赖链 -----------------*/
    const depStr = new DepStr({
      outerScope: outerDispose,
      innerScope: innerDispose,
      globalSignal,
      outerA,
      outerB,
      innerX,
      innerY,
      outerEffect,
      innerEffect
    });
    depStr.depIs(`
      globalSignal -> outerEffect -> outerScope
      outerA -> outerEffect
      outerB -> outerEffect
      outerA -> innerEffect -> innerScope -> outerScope
      innerX -> innerEffect
      innerY -> innerEffect
    `);
    depStr.outLinkIs(outerDispose, 'globalSignal');
    depStr.outLinkIs(innerDispose, 'outerA');
    log.toBe('outerResult: 13', 'innerResult: 8'); // outer: 10+1+2=13 inner: 1+3+4=8

    /*----------------- 验证计算结果 -----------------*/
    // 修改外层信号，观察影响
    outerA.v = 5;
    log.toBe('outerResult: 17', 'innerResult: 12'); // outer: 10+5+2=17 inner: 5+3+4=12

    // 修改内层信号，观察影响
    innerX.v = 6;
    log.toBe('innerResult: 15'); // inner: 5+6+4=15

    // 修改外部信号，观察影响
    globalSignal.v = 20;
    log.toBe('outerResult: 27'); // outer: 20+5+2=27

    /*----------------- 释放 innerScope -----------------*/
    innerDispose();
    depStr.outLinkIs(outerDispose, 'globalSignal');
    depStr.outLinkIs(innerDispose, '');
    depStr.depIs(`
      globalSignal -> outerEffect -> outerScope
      outerA -> outerEffect
      outerB -> outerEffect
      innerX -> innerEffect -> innerScope
      innerY -> innerEffect
    `);
    // 释放后，内部 effect 不再响应变化
    innerX.v = 7;
    log.toBe(); // 没有输出，因为内层scope已释放

    // 外部信号仍应正常工作
    outerA.v = 8;
    log.toBe('outerResult: 30'); // outer: 20+8+2=30

    /*----------------- 释放 outerScope -----------------*/
    outerDispose();
    depStr.outLinkIs(outerDispose, '');
    depStr.outLinkIs(innerDispose, '');
    depStr.depIs(`
      outerA -> outerEffect -> outerScope
      outerB -> outerEffect
      innerX -> innerEffect -> innerScope
      innerY -> innerEffect
    `);

    // 释放外层后，所有都不应再响应变化
    outerA.v = 9;
    globalSignal.v = 30;
    log.toBe(); // 没有任何输出
  });

  it('嵌套 scope - 外部先释放，内部自动释放 (使用 effect)', () => {
    const log = new Log();
    const globalSignal = $(10);

    let outerA, outerB, innerX, innerY, outerEffect, innerEffect, innerDispose;

    const outerDispose = scope(() => {
      outerA = $(1);
      outerB = $(2);

      // 外层 effect
      outerEffect = effect(() => {
        const res = globalSignal.v + outerA.v + outerB.v;
        log.call(`outerResult: ${res}`);
      });

      innerDispose = scope(() => {
        innerX = $(3);
        innerY = $(4);

        // 内层 effect，既依赖内层也依赖外层信号
        innerEffect = effect(() => {
          const res = outerA.v + innerX.v + innerY.v;
          log.call(`innerResult: ${res}`);
        });
      });
    });

    /*----------------- 初始依赖链 -----------------*/
    const depStr = new DepStr({
      outerScope: outerDispose,
      innerScope: innerDispose,
      globalSignal,
      outerA,
      outerB,
      innerX,
      innerY,
      outerEffect,
      innerEffect
    });
    depStr.depIs(`
      globalSignal -> outerEffect -> outerScope
      outerA -> outerEffect
      outerB -> outerEffect
      outerA -> innerEffect -> innerScope -> outerScope
      innerX -> innerEffect
      innerY -> innerEffect
    `);
    depStr.outLinkIs(outerDispose, 'globalSignal');
    depStr.outLinkIs(innerDispose, 'outerA');
    log.toBe('outerResult: 13', 'innerResult: 8'); // inner: 1+3+4=8, outer: 10+1+2=13

    /*----------------- 验证计算结果 -----------------*/
    // 修改外层信号，观察影响
    outerA.v = 5;
    log.toBe('outerResult: 17', 'innerResult: 12'); // inner: 5+3+4=12, outer: 10+5+2=17

    // 修改内层信号，观察影响
    innerX.v = 6;
    log.toBe('innerResult: 15'); // inner: 5+6+4=15

    // 修改外部信号，观察影响
    globalSignal.v = 20;
    log.toBe('outerResult: 27'); // outer: 20+5+2=27

    /*----------------- 先释放 outerScope (这应该自动释放 innerScope) -----------------*/
    outerDispose();
    depStr.outLinkIs(outerDispose, '');
    depStr.outLinkIs(innerDispose, '');

    // 外层释放后，内外层的 effect 都不应该再响应变化
    log.toBe(); // 没有新的输出

    // 此时外部信号的依赖已经被清理，内部和外部scope都已释放
    globalSignal.v = 30;
    outerA.v = 8;
    log.toBe(); // 仍然没有输出

    // 修改内部信号，也不应该有反应
    innerX.v = 7;
    innerY.v = 8;
    log.toBe(); // 仍然没有输出

    // 检查依赖链状态
    // 外部依赖 globalSignal -> outerEffect 和 outerA -> innerEffect 被释放
    depStr.depIs(`
      outerEffect -> outerScope
      outerA -> outerEffect
      outerB -> outerEffect
      innerEffect -> innerScope -> outerScope
      innerX -> innerEffect
      innerY -> innerEffect
    `);
  });
});

describe('effect 作为 scope 进行释放', () => {
  it('effect 作为独立对象进行释放', () => {
    const log = new Log();
    const A = $(1);
    const B = $(2);

    let dispose;

    // 创建 effect 并获取其 dispose 函数
    dispose = effect(() => {
      const result = A.v + B.v;
      log.call(`effect result: ${result}`);
    });

    /*----------------- 初始依赖链 -----------------*/
    const str = new DepStr({ A, B, ef: dispose });
    str.depIs(`
      A -> ef
      B -> ef
    `);
    str.outLinkIs(dispose, '');
    log.toBe('effect result: 3'); // A.v(1) + B.v(2) = 3

    /*----------------- 修改依赖信号 -----------------*/
    A.v = 5;
    log.toBe('effect result: 7'); // A.v(5) + B.v(2) = 7

    B.v = 3;
    log.toBe('effect result: 8'); // A.v(5) + B.v(3) = 8

    /*----------------- 手动释放 effect -----------------*/
    dispose(); // effect 返回的函数就是它的 dispose 函数
    str.depIs(``); // 依赖关系应该被清理
    str.outLinkIs(dispose, '');
    /*----------------- 释放后不再响应变化 -----------------*/
    A.v = 10;
    B.v = 20;
    log.toBe(); // 没有输出，因为 effect 已被释放
  });

  it('三层嵌套 effect-scope-effect，最外层 effect 依赖布尔值切换内部 scope 创建和销毁', () => {
    const log = new Log();
    const flag = $(true);
    const data = $(10);
    const innerData = $(100);

    let outerEffect;
    let midScope;
    let innerEffect;

    // 最外层是 effect，依赖 flag 来决定是否创建内部的 scope
    outerEffect = effect(() => {
      if (flag.v) {
        midScope = scope(() => {
          // 中间层是 scope，内部包含另一个 effect
          innerEffect = effect(() => {
            const result = data.v + innerData.v;
            log.call(`inner effect result: ${result}`);
          });
        });
      }
    });

    /*----------------- 初始依赖链 -----------------*/
    const str = new DepStr({ flag, data, innerData, outerEffect, midScope, innerEffect });
    str.depIs(`
      flag -> outerEffect
      data -> innerEffect
      innerData -> innerEffect -> midScope -> outerEffect
    `);
    log.toBe('inner effect result: 110'); // data(10) + innerData(100) = 110

    /*----------------- 修改内部数据，effect 应响应 -----------------*/
    data.v = 20;
    log.toBe('inner effect result: 120'); // data(20) + innerData(100) = 120

    innerData.v = 200;
    log.toBe('inner effect result: 220'); // data(20) + innerData(200) = 220

    /*----------------- 切换 flag 为 false，销毁内部 scope 和 effect -----------------*/
    flag.v = false;
    str.depIs(`
      flag -> outerEffect
      innerEffect -> midScope
    `);
    log.toBe(); // 没有输出，因为内部 effect 已被销毁

    // 修改内部数据，不应触发任何 effect
    data.v = 30;
    innerData.v = 300;
    log.toBe(); // 无输出

    /*----------------- 切换 flag 为 true，重新创建内部 scope 和 effect -----------------*/
    flag.v = true;
    const str2 = new DepStr({ flag, data, innerData, outerEffect, midScope, innerEffect });
    str2.depIs(`
      flag -> outerEffect
      data -> innerEffect
      innerData -> innerEffect -> midScope -> outerEffect
    `);
    log.toBe('inner effect result: 330'); // data(30) + innerData(300) = 330

    /*----------------- 继续修改数据验证响应性 -----------------*/
    data.v = 40;
    log.toBe('inner effect result: 340'); // data(40) + innerData(300) = 340

    /*----------------- 再次切换 flag 为 false -----------------*/
    flag.v = false;
    str2.depIs(`
      flag -> outerEffect
      innerEffect -> midScope
    `);
    log.toBe(); // 没有输出

    // 修改数据不应触发 effect
    data.v = 50;
    innerData.v = 500;
    log.toBe(); // 无输出

    /*----------------- 释放最外层 effect -----------------*/
    outerEffect();
    str2.depIs(`
      innerEffect -> midScope
    `);
    log.toBe(); // 无输出

    // 验证所有 effect 都已停止响应
    flag.v = true;
    data.v = 60;
    innerData.v = 600;
    log.toBe(); // 无输出
  });
});
