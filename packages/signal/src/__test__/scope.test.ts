import { $, scope } from '../index';
import { Log } from '../../../shared/__test__/log-order';
import { DepStr } from './dep-str';
describe('scope 基础用法', () => {
  it('孤岛引用回收', () => {
    const B = $(1);
    let a, c, d, b;
    const s = scope(() => {
      a = $(true);
      b = $(() => B.v);
      c = $(2);

      d = $(() => {
        return a.v ? b.v : c.v;
      });

      d();
    });
    const str = new DepStr({
      a,
      b,
      B,
      c,
      d,
      s,
    });
    str.dep(`
      a -> d -> s
      B -> b -> d
    `);

    a.v = false;
    str.dep(`
      a -> d -> s
      c -> d
      B -> b -> s
    `);
  });
});
