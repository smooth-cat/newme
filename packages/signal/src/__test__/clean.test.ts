import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';
import { $, effect, watch, scope, clean } from '../index';
describe('清除副作用测试', () => {
  it('clean 功能测试 - 在 scope 中注册清理函数', () => {
    const log = new Log();
    const signal = $(1);
    let cleanExecuted = false;

    const dispose = scope(() => {
      watch([() => signal()], () => {
        log.call('watcher执行');
      });

      // 注册清理函数
      clean(() => {
        cleanExecuted = true;
        log.call('清理函数执行');
      });
    });

    // 初始状态，改变信号会触发 watcher
    signal(2);
    log.toBe('watcher执行');

    // 验证清理函数尚未执行
    expect(cleanExecuted).toBe(false);

    // 调用 dispose 来清理 scope
    dispose();

    // 验证清理函数已执行
    expect(cleanExecuted).toBe(true);
    log.toBe('清理函数执行');

    // 验证 watcher 不再响应信号变化
    signal(3);
    log.toBe(); // 没有新的执行
  });

  it('嵌套 scope 中的 clean 功能测试', () => {
    const log = new Log();
    const signal = $(1);
    const cleanFlags = { outer: false, inner: false };

    const disposeOuter = scope(() => {
      clean(() => {
        cleanFlags.outer = true;
        log.call('外层清理函数执行');
      });

      scope(() => {
        watch([() => signal()], () => {
          log.call('watcher执行');
        });

        clean(() => {
          cleanFlags.inner = true;
          log.call('内层清理函数执行');
        });
      });
    });

    // 初始状态，改变信号会触发 watcher
    signal(2);
    log.toBe('watcher执行');

    // 验证清理函数尚未执行
    expect(cleanFlags.outer).toBe(false);
    expect(cleanFlags.inner).toBe(false);

    // 调用外层 dispose，应该清理整个嵌套结构
    disposeOuter();

    // 验证两个清理函数都已执行
    expect(cleanFlags.outer).toBe(true);
    expect(cleanFlags.inner).toBe(true);
    log.toBe('内层清理函数执行', '外层清理函数执行');

    // 验证 watcher 不再响应信号变化
    signal(3);
    log.toBe(); // 没有新的执行
  });

  it('clean 在 effect 中的使用 - 下一次执行前清理', () => {
    const log = new Log();
    const signal = $(1);
    let effectCount = 0;

    const dispose = effect(() => {
      effectCount++;
      log.call(`effect 执行 ${effectCount}`);

      // 注册清理函数，在下次 effect 执行前执行
      clean(() => {
        log.call(`清理函数执行 - effect ${effectCount} 结束`);
      });

      return signal();
    });

    // 初始执行
    log.toBe('effect 执行 1');

    // 第一次修改信号，触发 effect 重新执行
    signal(2);
    log.toBe('清理函数执行 - effect 1 结束', 'effect 执行 2');

    // 再次修改信号
    signal(3);
    log.toBe('清理函数执行 - effect 2 结束', 'effect 执行 3');

    // 清理 effect
    dispose();
    log.toBe('清理函数执行 - effect 3 结束');
  });

  it('clean 在 effect 中的使用 - dispose 时清理', () => {
    const log = new Log();
    const signal = $(1);
    let resourceState = 'active';

    const dispose = effect(() => {
      log.call('effect 开始执行');

      // 模拟资源分配
      resourceState = 'active';

      // 注册清理函数，在 effect 结束时执行
      clean(() => {
        resourceState = 'disposed';
        log.call(`资源清理，状态: ${resourceState}`);
      });

      return signal();
    });

    // 初始执行
    expect(resourceState).toBe('active');
    log.toBe('effect 开始执行');

    // 修改信号，验证清理函数在下次执行前运行
    signal(2);
    expect(resourceState).toBe('active'); // effect 重新执行后又变为 active
    log.toBe('资源清理，状态: disposed', 'effect 开始执行');

    // dispose effect，验证清理函数在 dispose 时运行
    dispose();
    expect(resourceState).toBe('disposed'); // 最终清理后变为 disposed
    log.toBe('资源清理，状态: disposed');
  });

  it('clean 在 watch 中 clean', () => {
    const log = new Log();
    const signal = $(1);
    let resourceState = 'uninitialized';
    let watchCount = 0;

    const dispose = watch([() => signal()], () => {
      const memoCount = watchCount++;
      log.call(`watch 执行 ${memoCount}`);
      // 模拟资源分配
      resourceState = 'active';

      // 注册清理函数，在 watch 结束时执行
      clean(() => {
        resourceState = 'disposed';
        log.call(`watch 清理 ${memoCount}`);
      });
    });

    // 初始执行
    expect(resourceState).toBe('uninitialized');

    // 修改信号，验证清理函数在下次执行前运行
    signal(2);
    expect(resourceState).toBe('active'); // watch 重新执行后又变为 active
    log.toBe('watch 执行 0');

    signal(3);
    expect(resourceState).toBe('active'); // watch 重新执行后又变为 active
    log.toBe('watch 清理 0', 'watch 执行 1');
    // dispose watch，验证清理函数在 dispose 时运行
    dispose();
    expect(resourceState).toBe('disposed');
    log.toBe('watch 清理 1');
  });

  it('clean 在 watch 中的使用 - 依赖变化触发清理', () => {
    const log = new Log();
    const signal1 = $(1);
    const signal2 = $(10);
    let watchCount = 0;

    const dispose = watch([() => signal1(), () => signal2()], ({ val: newVal1 }, { val: newVal2 }) => {
      const memoCount = watchCount++;
      log.call(`watch 执行 ${memoCount}: signal1=${newVal1}, signal2=${newVal2}`);

      // 注册清理函数
      clean(() => {
        log.call(`watch 清理 ${memoCount}`);
      });
    });

    // 修改第一个信号
    signal1(5);
    log.toBe('watch 执行 0: signal1=5, signal2=10');

    // 修改第二个信号
    signal2(20);
    log.toBe('watch 清理 0', 'watch 执行 1: signal1=5, signal2=20');

    // 清理 watch
    dispose();
    log.toBe('watch 清理 1');
  });
});
