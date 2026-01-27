import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';
import { $, scope } from '../index';
import { evt, G } from '../global';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  evt.clear();
  G.scopeDisposeI = 0;
});

describe('scope 基础用法', () => {
  it('孤岛引用回收', done => {
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

      d();
    });
    const str = new DepStr({ a, b, B, c, d, scope: dispose });
    log.toBe('d是1');
    str.dep(`
      a -> d -> scope
      B -> b -> d
    `);

    a.v = false;
    log.toBe('d是2');
    str.dep(`
      a -> d -> scope
      c -> d
      B -> b -> scope
    `);

    dispose();

    a.v = true;
    log.toBe(); // 禁用后不再拉取值，使用最后一次缓存的值
    expect(d.v).toBe(2);

    evt.on('one', ({ index }) => {
      str.dep(`
        a -> d -> scope
        c -> d
        b -> scope
      `);
      done();
    });
    jest.runAllTimers();
  });

  it('嵌套 scope 的依赖管理和释放', done => {
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
        innerResult();
      });

      // 访问外层信号
      outerResult();

      // 将内层dispose函数绑定到外层scope，这样可以测试嵌套行为
      (outerResult as any).innerDispose = innerDispose;
    });

    // 验证初始依赖关系
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
    log.toBe('innerResult: 8', 'outerResult: 13'); // inner: 1+3+4=8, outer: 10+1+2=13

    // 初始依赖关系应该是：
    // globalSignal -> outerResult
    // outerA -> outerResult, outerA -> innerResult
    // outerB -> outerResult
    // innerX -> innerResult, innerY -> innerResult
    depStr.dep(`
      globalSignal -> outerResult -> outerScope
      outerA -> outerResult
      outerB -> outerResult
      outerA -> innerResult -> innerScope -> outerScope
      innerX -> innerResult
      innerY -> innerResult
    `);

    // 修改外层信号，观察影响
    outerA.v = 5;
    log.toBe('innerResult: 12', 'outerResult: 17'); // inner: 5+3+4=12, outer: 10+5+2=17

    // 修改内层信号，观察影响
    innerX.v = 6;
    log.toBe('innerResult: 15'); // inner: 5+6+4=15

    // 修改外部信号，观察影响
    globalSignal.v = 20;
    log.toBe('outerResult: 27'); // outer: 20+5+2=27

    // 先释放内层scope
    innerDispose();

    // 释放后，内部信号不再响应变化
    innerX.v = 7;
    log.toBe(); // 没有输出，因为内层scope已释放

    // 外部信号仍应正常工作
    outerA.v = 8;
    log.toBe('outerResult: 30'); // outer: 20+8+2=30

    // 释放外层scope
    outerDispose();

    evt.on('one', ({ index }) => {
      switch (index) {
        case 0:
          depStr.dep(`
            globalSignal -> outerResult -> outerScope
            outerA -> outerResult
            outerB -> outerResult
            innerResult -> innerScope
            innerX -> innerResult
            innerY -> innerResult
          `);
          break;
        case 1:
          depStr.dep(`
            outerResult -> outerScope
            outerA -> outerResult
            outerB -> outerResult
            innerResult -> innerScope
            innerX -> innerResult
            innerY -> innerResult
          `);
          done();
        default:
          break;
      }
    });

    jest.runAllTimers();
    // // 释放外层后，所有都不应再响应变化
    // outerA.v = 9;
    // globalSignal.v = 30;
    // log.toBe(); // 没有任何输出
  });
});
