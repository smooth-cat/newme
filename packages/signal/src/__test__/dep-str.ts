import { Signal } from '../signal';

it('dep-str协助测试', () => {
  expect('a').toBe('a');
});
export class DepStr {
  reflect = new Map();
  signals: Record<string, Signal> = {};
  constructor(signals: Record<string, any>) {
    for (const key in signals) {
      const signalOrDispose = signals[key];
      if (signalOrDispose instanceof Signal) {
        this.signals[key] = signalOrDispose;
      } else {
        this.signals[key] = signalOrDispose.ins;
      }
    }
    for (const key in this.signals) {
      const curr = this.signals[key];
      this.reflect.set(curr, key);
    }
  }

  /**
   * a -> b -> c
   */
  depIs(str: string) {
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

    for (const key in this.signals) {
      const curr = this.signals[key] as Signal;
      const currName = this.reflect.get(curr);
      let line = curr.emitStart;
      while (line != null) {
        // if (line.downstream && line.downstream === line.downstream['scope']) continue;
        const downName = this.reflect.get(line.downstream);
        state.push(`${currName} -> ${downName}`);
        line = line.nextEmitLine;
      }
      line = curr.recStart;
      while (line != null) {
        const upName = this.reflect.get(line.upstream);
        state.push(`${upName} <- ${currName}`);
        line = line.nextRecLine;
      }
    }
    handled.sort();
    state.sort();
    expect(state).toEqual(handled);
    return this;
  }

  outLinkIs({ ins }: { ins: Signal }, outLink: string) {
    const links = outLink ? outLink.trim().split(/\s+/).sort() : [];
    let point = ins.outLink;
    const hasLinks = [];
    while (point) {
      const refedName = this.reflect.get(point.upstream);
      hasLinks.push(refedName);
      point = point.nextOutLink;
    }
    hasLinks.sort();
    expect(hasLinks).toEqual(links);
    return this;
  }
}
