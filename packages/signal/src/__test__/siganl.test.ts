import { $ } from '../index';
import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';

describe('signal 基础功能测试', () => {
  it('基础值变化', () => {
    const log = new Log();
    const s1 = $(1);
    const s2 = $(() => {
      log.call('s2计算');
      return s1.v + 1;
    });

    // 初始计算
    expect(s2()).toBe(2);
    log.toBe('s2计算'); // ['s2计算'] 被验证并清空

    // 改变 s1 的值
    s1(5);
    // 此时还没有重新计算，再次调用 s2() 会触发重新计算
    expect(s2()).toBe(6); // 触发重新计算
    log.toBe('s2计算'); // 新的一次计算
  });

  it('链式依赖', () => {
    const log = new Log();
    const a = $(1);
    const b = $(() => {
      log.call('b计算');
      return a.v * 2;
    });
    const c = $(() => {
      log.call('c计算');
      return b.v + 3;
    });

    const depStr = new DepStr({ a, b, c });

    // 初始计算
    expect(c()).toBe(5); // 1 * 2 + 3
    log.toBe('c计算', 'b计算');
    depStr.depIs(`
      a -> b -> c
    `);

    // 改变源头值
    a(3);
    expect(c()).toBe(9); // 3 * 2 + 3
    log.toBe('b计算', 'c计算'); // b 和 c 都重新计算
  });

  it('条件依赖', () => {
    const log = new Log();
    const condition = $(true);
    const value1 = $(10);
    const value2 = $(20);
    const result = $(() => {
      log.call('result计算');
      return condition.v ? value1.v : value2.v;
    });

    const depStr = new DepStr({ condition, value1, value2, result });

    // 初始：条件为 true，依赖 value1
    expect(result()).toBe(10);
    log.toBe('result计算');
    depStr.depIs(`
      condition -> result
      value1 -> result
    `);

    // 改变条件为 false，现在依赖 value2
    condition(false);
    expect(result()).toBe(20);
    log.toBe('result计算'); // 重新计算

    // 创建新的 DepStr 来检查新依赖
    const depStr2 = new DepStr({ condition, value1, value2, result });
    depStr2.depIs(`
      condition -> result
      value2 -> result
    `);

    // 改变 value1（现在不被依赖），不应触发重新计算
    value1(100);
    expect(result()).toBe(20);
    // 因为 value1 不再被依赖，访问它不会触发 result 的重新计算
    log.toBe(); // 没有新的调用
  });

  it('嵌套条件依赖', () => {
    const log = new Log();
    const flag1 = $(true);
    const flag2 = $(false);
    const a = $(1);
    const b = $(2);
    const c = $(3);

    const result = $(() => {
      log.call('result计算');
      if (flag1.v) {
        if (flag2.v) {
          return a.v;
        } else {
          return b.v;
        }
      } else {
        return c.v;
      }
    });

    const depStr = new DepStr({ flag1, flag2, a, b, c, result });

    // 初始状态：flag1=true, flag2=false，所以返回 b.v
    expect(result()).toBe(2);
    log.toBe('result计算');
    depStr.depIs(`
      flag1 -> result
      flag2 -> result
      b -> result
    `);

    // 改变 flag2 为 true，现在返回 a.v
    flag2(true);
    expect(result()).toBe(1);
    log.toBe('result计算');
    const depStr2 = new DepStr({ flag1, flag2, a, b, c, result });
    depStr2.depIs(`
      flag1 -> result
      flag2 -> result
      a -> result
    `);

    // 改变 flag1 为 false，现在返回 c.v
    flag1(false);
    expect(result()).toBe(3);
    log.toBe('result计算');
    const depStr3 = new DepStr({ flag1, flag2, a, b, c, result });
    depStr3.depIs(`
      flag1 -> result
      c -> result
    `);
  });

  it('重复访问相同信号不应重复计算', () => {
    const log = new Log();
    const source = $(5);
    const computed = $(() => {
      log.call('computed计算');
      return source.v * 2;
    });

    // 第一次访问，触发计算
    expect(computed()).toBe(10);
    log.toBe('computed计算');

    // 立即再次访问，应该使用缓存
    expect(computed()).toBe(10);
    log.toBe(); // 没有新的计算

    // 改变 source，然后再次访问
    source(10);
    expect(computed()).toBe(20);
    log.toBe('computed计算'); // 重新计算了一次
  });

  it('多层嵌套依赖 - 初始建立依赖 vs 后续更新', () => {
    const log = new Log();
    const root = $(1);

    const level1 = $(() => {
      log.call('level1计算');
      return root.v * 2;
    });

    const level2 = $(() => {
      log.call('level2计算');
      return level1.v * 3;
    });

    const level3 = $(() => {
      log.call('level3计算');
      return level2.v * 4;
    });

    const final = $(() => {
      log.call('final计算');
      return level3.v + 10;
    });

    const depStr = new DepStr({ root, level1, level2, level3, final });

    // 初始计算 - 通过 pullRecurse 建立依赖链（先序遍历）
    expect(final()).toBe(34); // 1*2*3*4 + 10 = 34
    log.toBe('final计算', 'level3计算', 'level2计算', 'level1计算'); // 先序：final -> level3 -> level2 -> level1
    depStr.depIs(`
      root -> level1 -> level2 -> level3 -> final
    `);

    // 改变源头 - 现在已有依赖链，通过 pullDeep 遍历（后序遍历）
    root(2);
    expect(final()).toBe(58); // 2*2*3*4 + 10 = 58
    log.toBe('level1计算', 'level2计算', 'level3计算', 'final计算'); // 后序：level1 -> level2 -> level3 -> final
  });

  it('最简菱形依赖', () => {
    const log = new Log();
    const a = $(1);
    const b = $(() => {
      log.call('b计算');
      return a.v * 2;
    });
    const c = $(() => {
      log.call('c计算');
      return a.v + 3;
    });
    const d = $(() => {
      log.call('d计算');
      return b.v + c.v;
    });

    const depStr = new DepStr({ a, b, c, d });

    // 初始计算
    expect(d()).toBe(6); // b=1*2=2, c=1+3=4, d=2+4=6
    log.toBe('d计算', 'b计算', 'c计算'); // pullRecurse 先序遍历：d -> b -> c
    depStr.depIs(`
      a -> b -> d
      a -> c -> d
    `);

    // 改变共享依赖 a
    a(2);
    expect(d()).toBe(9); // b=2*2=4, c=2+3=5, d=4+5=9

    // pullDeep b 变了后，直接返回 d 进行 pullRecurse 后续遍历，所以是 b, d, c
    // pullDeep 和 pullRecurse 交替工作，取决于当前节点是否有上游节点
    log.toBe('b计算', 'd计算', 'c计算');
  });

  it('菱形依赖 - 依赖重建', () => {
    const log = new Log();
    const s0 = $(0);
    const s1 = $(1);
    const s2 = $(2);

    const s3 = $(() => {
      log.call('s3计算');
      if (!s0.v) {
        return s1.v;
      }
      return s2.v;
    });

    const s4 = $(() => {
      log.call('s4计算');
      return s0.v + 4;
    });

    const s5 = $(() => {
      log.call('s5计算');
      return s3.v + s4.v;
    });

    const s6 = $(() => {
      log.call('s6计算');
      return s5.v;
    });

    const depStr = new DepStr({ s0, s1, s2, s3, s4, s5, s6 });

    // 初始计算 - pullRecurse 建立依赖
    expect(s6()).toBe(5); // s0=0, !s0.v=true, s3=s1.v=1, s4=0+4=4, s5=1+4=5, s6=5
    log.toBe('s6计算', 's5计算', 's3计算', 's4计算'); // 先序遍历
    depStr.depIs(`
      s0 -> s3 -> s5 -> s6
      s1 -> s3
      s0 -> s4 -> s5
    `);

    // 改变 s0，导致依赖重建
    s0(1);
    expect(s6()).toBe(7); // s0=1, !s0.v=false, s3=s2.v=2, s4=1+4=5, s5=2+5=7, s6=7
    log.toBe('s3计算', 's5计算', 's4计算', 's6计算'); // pullDeep 后序遍历
  });

  it('中间节点修改值', () => {
    const log = new Log();
    const a = $(1);
    const b = $(() => {
      log.call('b计算');
      return a.v * 2;
    });
    const c = $(() => {
      log.call('c计算');
      return b.v + 3;
    });

    const depStr = new DepStr({ a, b, c });

    // 初始计算
    expect(c()).toBe(5); // b=1*2=2, c=2+3=5
    log.toBe('c计算', 'b计算');
    depStr.depIs(`
      a -> b -> c
    `);

    // 直接修改中间节点 b 的值
    b(10);
    expect(c()).toBe(13); // c=b.v+3=10+3=13
    log.toBe('c计算'); // 只有 c 需要重新计算，因为 b 的值被直接设置了

    a(2);
    expect(c()).toBe(7);
    log.toBe('b计算', 'c计算');
    depStr.depIs(`
      a -> b -> c
    `);
  });
});
