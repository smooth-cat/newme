// import { $, signal } from '.';

/*----------------- 菱形依赖， 不会重复触发 ✅ -----------------*/
// const s0 = signal(0);
// const s1 = signal(1);
// const s2 = signal(2);

// const v3 = $(() => {
//   if (!s0()) {
//     return s1();
//   }
//   return s2();
// });

// const v4 = $(() => {
//   return s0() + 4;
// });

// const v5 = $(() => {
//   console.log({
//     v3: v3(),
//     v4: v4()
//   });
//   return v3() + v4();
// });

// const ef6 = $(() => {
//   console.log({ v5: v5() });
//   return v5();
// });

// ef6();

// s0(1);

/*----------------- 中间值不变 -----------------*/
// const s0 = signal(1);

// const v1 = $(() => {
//   const abs = Math.abs(s0());
//   return abs;
// });

// const ef2 = $(() => {
//   console.log(v1());
// });

// ef2();

// s0(-1)