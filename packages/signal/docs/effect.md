```ts
// 默认 自动收集
effect(() => {
  // 注销
  return () => {
    
  }
}, { 
	scheduler: xxx,
  // 固定为 true
  immediate: true,
});

// 指定 dep = []
effect(() => {
  
}, [], {
  // 固定为 true
  immediate: true,
});

// 指定 dep
effect(() => {
  
}, [dep1, dep2], {
  // 默认为 false
  immediate: true,
});


```

