Scope 外部引用的情况

1. 子引用父 scope 中声明的 signal

   ```
   outSignal -> innerSignal -> innerScope -> outScope
   ```

   1. outSignal 只有唯一下游 innerSignal， innerScope 释放时，需 将 outSignal 交由 outScope 管理 （outScope 还未释放）
   2. outScope 释放时，如果 innerScope 仍未释放应该将 innerScope 同时释放

2. 非父子关系的 signal 引用

   ```
   signal1 -> innerSignal -> scope
   ```

   

## dispose

1. effect、watch 都属于 scope
2. 外部 scope dispose，会递归地 dispose 内部 scope
3. scope dispose 后，所有 signal 被调用 get 时只会返回 缓存值
4. dispose 时会打断 scope.outLink 中保存的所有外部依赖
5. dispose 时还会打断 直接上游 signal 的依赖
6. 打断依赖链时，如果上游节点是唯一引用，会递归进行打断