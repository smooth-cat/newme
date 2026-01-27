type StrNum = string | number;
export class Log {
  order: StrNum[] = [];

  fnMap = new Map<StrNum, Function>();
  fn(name: StrNum) {
    if (this.fnMap.has(name)) {
      return this.fnMap.get(name);
    }
    const fn = jest.fn(() => {
      this.order.push(name);
    });
    this.fnMap.set(name, fn);
    return fn;
  }

  call(name: StrNum) {
    this.fn(name)?.();
  }

  toBe(...args: StrNum[]) {
    expect(this.order).toEqual(args);
    this.order = [];
  }

  clear() {
    this.order = [];
    this.fnMap.clear();
  }
}
