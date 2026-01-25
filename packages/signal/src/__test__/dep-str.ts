import { Signal } from 'src';

it('dep-str协助测试', () => {
  expect('a').toBe('a');
});
export class DepStr {
  constructor(public signals: Record<string, any>) {}

  /**
   * a -> b -> c
   */
  dep(str: string) {
    const lines = str.split('\n');
    let handled: string[] = [];
    lines.forEach(line => {
      const chars = line.split('->');

      if (chars.length <= 1) return;
      chars.forEach((it, i) => {
        const name = it.trim();
        const nextName = (chars[i + 1] || '').trim();
        if (!name || !nextName) {
          return;
        }
        handled.push(`${name} -> ${nextName}`);
        handled.push(`${name} <- ${nextName}`);
      });
    });
    handled = Array.from(new Set(handled));

    const state = [];
    const reflect = new Map();
    for (const key in this.signals) {
      const curr = this.signals[key].ins as Signal;
      reflect.set(curr, key);
    }
    for (const key in this.signals) {
      const curr = this.signals[key].ins as Signal;
      const currName = reflect.get(curr);
      let line = curr.emitStart;
      while (line != null) {
        // if (line.downstream && line.downstream === line.downstream['scope']) continue;
        const downName = reflect.get(line.downstream);
        state.push(`${currName} -> ${downName}`);
        line = line.nextEmitLine;
      }
      line = curr.recStart;
      while (line != null) {
        const upName = reflect.get(line.upstream);
        state.push(`${upName} <- ${currName}`);
        line = line.nextRecLine;
      }
    }
    handled.sort();
    state.sort();
    expect(state).toEqual(handled);
  }
}
