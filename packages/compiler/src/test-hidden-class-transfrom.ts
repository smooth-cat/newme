export class A {
  static HH = 'hh';
  value = 10;
  constructor(a = 10) {}
  change(value: number) {
    this.value = value;
  }
  get = function () {
    console.log(this.value);
  };

  get v() {
    return this.value;
  }
  set v(v: number) {
    this.value = v;
  }
}
const a = new A();

a.change(20);
a.get();
class B {
  value = 10;
  constructor(a = 10) {}
  change(value: number) {
    this.value = value;
  }
  get = function () {
    console.log(this.value);
  };

  get v() {
    return this.value;
  }
  set v(v: number) {
    this.value = v;
  }
}
const b = new B();

b.change(20);
b.get();

export default class {
  constructor(
    private b: number,
    public value = 10
  ) {}

  change(value: number) {
    this.value = value;
  }
  get = function () {
    console.log(this.value);
  };

  get v() {
    return this.value;
  }
}
