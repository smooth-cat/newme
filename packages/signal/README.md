# aoye
一个高效的 signal 库

嗷耶(＾－＾)V

## Usage

```typescript
import { $, watch } form 'aoye';
// 创建一个信号
const s1 = $(1);

// 取值
const a = s1.v;
// 或
const b = s1();

// 设值
s1.v = 2;
// 或
s1(2);

// 计算
const c = $(() => s1.v * 2);

// effect 自动监听 (无返回值的计算)
$(() => {
	console.log('c有变化', c.v);
})();

// 仅当 c 变化时，监听器执行
watch([c], () => {
  console.log('s1的值是', s1.v);
});

// scope 用于批量控制信号
const dispose = scope(() => {
  const a = $(1);
  
  watch([a], () => {
    console.log('s1的值是', s1.v);
  });
})

// scope 内的信号不再生效
dispose();
```

