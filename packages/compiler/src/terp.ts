import { Tokenizer } from './tokenizer';
import { $, deepSignal, effect, getPulling, Keys, runWithPulling, setPulling, shareSignal, Signal, Store } from 'aoye';
import {
  BobeUI,
  ComponentNode,
  CondBit,
  FragmentNode,
  IfNode,
  IsAnchor,
  LogicalBit,
  LogicNode,
  FakeType,
  NodeSort,
  ProgramCtx,
  StackItem,
  TerpConf,
  TerpEvt,
  TokenType,
  TokenizerSwitcherBit
} from './type';
import { BaseEvent } from 'bobe-shared';
import { MultiTypeStack } from './typed';
const tap = new BaseEvent();

export class Interpreter {
  opt: TerpConf;
  constructor(private tokenizer: Tokenizer) {}
  isLogicNode(node: any) {
    return node && node.__logicType & LogicalBit;
  }

  ctx: ProgramCtx;
  rootComponent: ComponentNode | null = null;

  program(root: any, componentNode?: ComponentNode, before?: any) {
    // 首屏渲 app 组件需要创建对象
    this.rootComponent = componentNode;

    this.tokenizer.nextToken();
    const stack = new MultiTypeStack<StackItem>();
    stack.push({ node: root, prev: null }, NodeSort.Real);
    stack.push(
      { node: componentNode, prev: null },
      NodeSort.Component | NodeSort.CtxProvider | NodeSort.TokenizerSwitcher
    );

    const ctx = (this.ctx = {
      realParent: root,
      prevSibling: before,
      current: null,
      stack,
      before
    });

    const rootPulling = getPulling();
    while (1) {
      // 子 tokenizer 退出，代表子组件逻辑结束
      if (this.tokenizer.isEof()) {
        if (!ctx.prevSibling) ctx.prevSibling = before;
        this.handleInsert(root, ctx.current, ctx.prevSibling, componentNode);
        break;
      }

      const token = this.tokenizer.token;
      // 下沉，创建 child0
      if (token.type & TokenType.Indent) {
        this.tokenizer.nextToken(); // INDENT
        const isLogicNode = this.isLogicNode(ctx.current);
        stack.push(
          {
            node: ctx.current,
            prev: ctx.prevSibling
          },
          !ctx.current.__logicType
            ? NodeSort.Real
            : (ctx.current.__logicType & LogicalBit ? NodeSort.Logic : 0) |
                (ctx.current.__logicType & TokenizerSwitcherBit ? NodeSort.TokenizerSwitcher : 0) |
                (ctx.current.__logicType === FakeType.Component ? NodeSort.Component : 0) |
                NodeSort.CtxProvider
        );
        if (ctx.current.__logicType) {
          // 父节点是逻辑节点
          if (isLogicNode) {
            // 保证 if 子逻辑节点能被其 effect 管理
            setPulling(ctx.current.effect.ins);
          }
        }
        // 父节点是原生节点时才修改 ctx.prevSibling
        else {
          if (ctx.current) {
            ctx.realParent = ctx.current;
          }
          ctx.prevSibling = null;
        }
        ctx.current = this.declaration(ctx);
        continue;
      }
      // Token 不论指示找 下一个同级节点，还是 Dedent, 都将当前节点插入
      if (ctx.current) {
        // root 下第一个子节点应该插入在 before 之后
        if (stack.length === 2 && !ctx.prevSibling) {
          ctx.prevSibling = before;
        }
        this.handleInsert(ctx.realParent, ctx.current, ctx.prevSibling);
      }
      // 下一个 token 是 Dedent
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.nextToken(); // DEDENT
        const [{ node: parent, prev }, sort] = stack.pop();
        // 弹出原生节点，找最近的 ctx.realParent
        if (!parent.__logicType) {
          const prevSameType = stack.peekByType(NodeSort.Real);
          ctx.realParent = prevSameType?.node || root;
        }
        // 弹出非原生节点
        else {
          // 考虑 if, for 等获取最后一个插入节点
          if (sort & NodeSort.Logic) {
            // 找最近的 if for
            const parentLogic = stack.peekByType(NodeSort.Logic)?.node;
            if (parentLogic) {
              setPulling(parentLogic.effect.ins);
            } else {
              setPulling(rootPulling);
            }
          }
          // 子 tokenizer 使用 Dedent 推出 component 节点后，将 tokenizer 切换为 上一个 TokenSwitcher 的 tokenizer
          if (sort & NodeSort.TokenizerSwitcher) {
            const switcher = stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
            this.tokenizer = switcher.tokenizer;
          }
        }
        ctx.prevSibling = prev;
        ctx.current = parent;
      }
      // 下一个是 同级节点
      else {
        ctx.prevSibling = ctx.current || ctx.prevSibling;
        ctx.current = this.declaration(ctx);
      }
    }
    return componentNode;
  }

  switcherIsRootComponent() {
    const currentSwitcher = this.ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
    return currentSwitcher === this.rootComponent;
  }

  insertAfterAnchor(ctx: ProgramCtx) {
    const { realParent, prevSibling, stack, before } = ctx;
    // 先将 after 插入
    const afterAnchor = this.createAnchor();
    ctx.prevSibling = stack.length === 2 && !prevSibling ? before : prevSibling;
    this.handleInsert(realParent, afterAnchor, prevSibling);
    return afterAnchor;
  }

  /** 处理
   *                    是逻辑                               是普通
   * 父节点       将子节点加入 directList         调用 insert 方法挨个插入子节点
   * 子节点           仅插入到父逻辑节点              将本节点插入父节点
   * 理论上父节点不能是一个 逻辑节点，遇到if 时 Terp 会重新执行 program 这种情况下，会指定 root 为真实 dom
   */
  handleInsert(parent: any, child: any, prev: any, parentComponent?: any) {
    // 父 是 逻辑节点
    if (parentComponent) {
      // parentComponent.directList.push(child);
    }
    // 子 普通节点
    if (!child.__logicType) {
      // 前置节点空 或 普通节点
      if (!prev || !prev.__logicType) {
        this.insertAfter(parent, child, prev);
      }
      // 前置节点是逻辑节点，必定有 after
      else {
        const before = prev.realAfter;
        this.insertAfter(parent, child, before);
      }
    }
    // 子 是 逻辑节点
    else {
      const childCmp: LogicNode = child;
      childCmp.realParent = parent;
      // 前置 -> 逻辑节点
      if (prev?.__logicType) {
        childCmp.realBefore = prev.realAfter;
      }
      // 前置 -> 普通节点
      else {
        childCmp.realBefore = prev;
      }
    }
  }

  /** 考虑到同级 逻辑模块 */
  getPrevRealSibling(prevSibling: any) {
    // 正常节点则直接返回
    if (!prevSibling || !prevSibling.__logicType) {
      return prevSibling;
    }
    let point = prevSibling;
    while (point != null) {
      if (point.lastChild) {
        return point.lastChild.value;
      }
      point = point.anchor;
    }
  }

  /**
   * 声明部分：
   * 包含首行定义和（可选的）多行属性扩展
   * <declaration> ::= <tagName=token> <headerLine> <extensionLines>
   *  */
  declaration(ctx: ProgramCtx) {
    const [hookType, value] = this.tokenizer._hook({});
    let _node: any;
    if (value === 'if' || value === 'else' || value === 'fail') {
      return this.condDeclaration(ctx);
    } else if (hookType) {
      // 静态 1. Component，2. bobe 返回的 render 方法
      if (hookType === 'static') {
        // 传组件 class 或 片段
        if (typeof value === 'function') {
          _node = this.componentOrFragmentDeclaration(value, ctx);
        }
        // 其余类型不允许静态插值
        else {
          throw new SyntaxError(`declaration 不支持 ${value} 类型的静态插值`);
        }
      }
      // 动态插值
      // 一定是 js 表达式
      // 1. 返回基础值，创建文本节点 createNode('text', String(value))
      // 2. 返回  组件，创建组件节点
      // 3. 返回  片段
      // TODO: 后续考虑动态组件
      else {
        _node = this.componentOrFragmentDeclaration(value, ctx);
      }
    } else {
      _node = this.createNode(value);
    }
    this.tokenizer.nextToken();
    this.headerLine(_node);
    this.extensionLines(_node);
    // 组件用完，切换回 真实node 的方法
    if (_node.__logicType & TokenizerSwitcherBit) {
      this.onePropParsed = this.oneRealPropParsed;
      this.tokenizer = _node.tokenizer;
    }
    return _node;
  }
  getData() {
    const { node } = this.ctx.stack.peekByType(NodeSort.CtxProvider);
    return node.data || node.owner.data;
  }

  /**
   * key 元素，组件的 key
   * value
   * 1. 静态类型值
   * 2. 插值计算 函数，可以考虑 使用 effect 或 computed 做处理
   *
   * mapKey 映射, 对应子组件的属性
   *  */
  onePropParsed(
    data: Store,
    node: any,
    key: string,
    value: any,
    valueIsMapKey: boolean,
    isFn: boolean,
    hookI?: number
  ) {
    if (isFn) {
      this.setProp(node, key, value, hookI);
    } else if (typeof value === 'function') {
      effect(() => {
        const res = value();
        this.setProp(node, key, res, hookI);
      });
    } else if (valueIsMapKey) {
      effect(() => {
        const res = data[value];
        this.setProp(node, key, res, hookI);
      });
    }
    // 静态数据
    else {
      this.setProp(node, key, value, hookI);
    }
  }

  oneRealPropParsed: Interpreter['onePropParsed'] = this.onePropParsed.bind(this);

  componentOrFragmentDeclaration(ComponentOrRender: BobeUI | typeof Store | string, ctx: ProgramCtx) {
    // 先进行 attr 映射，或建立 signal 连接，才能开始 render
    // 必须等待 attr 解析完毕
    let Component: typeof Store, render: BobeUI, child: any;
    const data = this.getData();
    // 如果是字符串，就去 父中取动态的 Component
    if (typeof ComponentOrRender === 'string') {
      ComponentOrRender = data[ComponentOrRender];
    }

    const isCC = (ComponentOrRender as any).prototype instanceof Store;
    if (isCC) {
      Component = ComponentOrRender as any;
      child = Component.new();
    } else {
      render = ComponentOrRender as any;
      // 使用原型链来继承 store 的数据
      child = deepSignal({}, getPulling(), true);
      Object.setPrototypeOf(child, data);
    }

    const node: ComponentNode = {
      __logicType: isCC ? FakeType.Component : FakeType.Fragment,
      realParent: ctx.realParent,
      data: child,
      tokenizer: render ? render(true) : (child['ui'] as BobeUI)(true)
    };
    this.onePropParsed = (data, _, key, value, valueIsMapKey, isFn, hookI) => {
      if (isFn) {
        child[Keys.Raw][key] = value;
      }
      // key 映射
      else if (valueIsMapKey) {
        shareSignal(data, value, child, key);
      }
      // 动态值内置 computed 处理
      else if (typeof value === 'function') {
        const meta = child[Keys.Meta];
        const cells: Map<string, Signal> = meta.cells;
        const computed = $(value);
        cells.set(key, computed);
      }
      // 静态值
      else {
        child[Keys.Raw][key] = value;
      }
    };
    node.realAfter = this.insertAfterAnchor(ctx);
    return node;
  }
  // TODO: 优化代码逻辑，拆分 if elseif else
  condDeclaration(ctx: ProgramCtx) {
    const { prevSibling } = ctx;
    const snapbackUp = this.tokenizer.snapshot();
    const keyWord = this.tokenizer.token;
    this.tokenizer.nextToken(); // keyWord
    const noSelfCond = this.tokenizer.token.type === TokenType.NewLine;

    const [hookType, value] = this.tokenizer._hook({});
    const isElse = keyWord.value === 'else';
    const isIf = keyWord.value === 'if';
    const preIsCond = prevSibling?.__logicType & CondBit;
    // 需要和前一个节点的 condition 合并计算
    const needCalcWithPrevIf = isElse && preIsCond;
    const data = this.getData();
    const owner = ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
    const ifNode: IfNode = {
      __logicType: isElse ? FakeType.Else : isIf ? FakeType.If : FakeType.Fail,
      snapshot: noSelfCond ? snapbackUp : this.tokenizer.snapshot(),
      condition: null,
      realParent: null,
      preCond: preIsCond ? prevSibling : null,
      isFirstRender: true,
      effect: null,
      owner
    };
    let signal: Signal;

    // 纯 else 节点，一定要前置节点的取反
    if (noSelfCond) {
      if (isElse) {
        signal = $(() => {
          let point = ifNode.preCond;
          while (point) {
            if (point.condition.v) {
              return false;
            }
            // else 的条件判断应该停止在第一个访问到的 if 节点
            if (point.__logicType === FakeType.If) {
              break;
            }
            point = point.preCond;
          }
          return true;
        });
      }
      // default
      else {
        signal = $(() => {
          let point = ifNode.preCond;
          while (point) {
            if (point.condition.v) {
              return false;
            }
            point = point.preCond;
          }
          return true;
        });
      }
    } else {
      const valueIsMapKey = Reflect.has(data[Keys.Raw], value);
      // 为键映射
      if (valueIsMapKey && !needCalcWithPrevIf) {
        // 确保 signal 已生成
        runWithPulling(() => data[value], null);
        // 拿到 signal
        const { cells } = data[Keys.Meta];
        signal = cells.get(value);
      }
      // 通过前置条件 和 computed 计算出
      else {
        const fn = new Function('data', `let v;with(data){v=${value}};return v;`).bind(undefined, data);
        if (needCalcWithPrevIf) {
          signal = $(() => {
            let point = ifNode.preCond;
            while (point) {
              if (point.condition.v) {
                return false;
              }
              // else 的条件判断应该停止在第一个访问到的 if 节点
              if (point.__logicType === FakeType.If) {
                break;
              }
              point = point.preCond;
            }
            return fn();
          });
        } else {
          // 是 getter 使用 computed 计算出一个 signal
          signal = $(fn);
        }
      }
    }

    ifNode.condition = signal;
    // 不论是否执行 if 都应该插入 anchor 节点用于后续
    ifNode.realAfter = this.insertAfterAnchor(ctx);

    ifNode.effect = effect(
      ({ val }) => {
        // 如果值是 true 则直接放行让下面的节点自然执行插入
        if (val) {
          if (ifNode.isFirstRender) {
            if (!noSelfCond) {
              this.tokenizer.nextToken(); // condition
            }
            this.tokenizer.nextToken(); // NEWLINE
          }
          // 更新渲染
          else {
            // 切换到对应 Switcher 的 tokenizer
            this.tokenizer = ifNode.owner.tokenizer;
            /**
             *  condition 在首屏对应的是 当前 token, resume 时被设置为空
             *  newLine 被用于判断起始缩进所消耗
             */
            this.tokenizer.resume(ifNode.snapshot);

            // TODO: 由于首屏渲染直接放行，导致 if 子节点首屏产生的 effect 不能被管理
            // 在 effect 中创建的子组件 sub effect 能被管理
            // 当 if = false 时，不需要执行销毁子 effect 操作
            // 因为当外部 effect 重新执行时，上次尝试的 sub effect 自动销毁
            // 前提是 sub effect 是嵌套执行的
            this.program(ifNode.realParent, ifNode.owner, ifNode.realBefore);
          }
        }
        // 删除逻辑块
        else {
          if (ifNode.isFirstRender) {
            if (noSelfCond) {
              // 让 '/n‘ 能被 skip 处理
              this.tokenizer.i = this.tokenizer.i - 1;
              // else 时消费了一个 \n 导致 needDent 被置为 true
              this.tokenizer.needIndent = false;
            }
            this.tokenizer.skip(); // skipStr
          }
          // 更新渲染，删除所有节点
          else {
            const { realBefore, realAfter, realParent } = ifNode;
            let point = realBefore ? this.nextSib(realBefore) : this.firstChild(realParent);
            while (point !== realAfter) {
              const next = this.nextSib(point);
              this.remove(point, realParent, realBefore);
              point = next;
            }
          }
        }
        ifNode.isFirstRender = false;
      },
      [signal]
    );
    return ifNode;
  }

  /**
   * <extensionLines> ::= PIPE <attributeList> NEWLINE <extensionLines>
   *                    | ε
   */
  extensionLines(_node: any) {
    while (1) {
      //  终止条件，下一行不是 pipe
      if ((this.tokenizer.token.type & TokenType.Pipe) === 0) {
        return;
      }
      // 开始解析 attributeList
      this.tokenizer.nextToken(); // PIPE
      this.attributeList(_node);
      // 文件结束了，通常不会发生
      if ((this.tokenizer.token.type & TokenType.NewLine) === 0) {
        return;
      }
      // 换行
      this.tokenizer.nextToken(); // NEWLINE
    }
  }

  /**
   * 首行：
   * 节点名称 + 属性列表 + 换行
   * <headerLine> ::= <attributeList> NEWLINE
   */
  headerLine(_node: any) {
    this.attributeList(_node);
    this.tokenizer.nextToken(); // NEWLINE
  }

  /**
   * 属性列表：
   * 可以是空的，或者包含多个属性
   * <attributeList> ::= <attribute> <attributeList>
   *                    | ε
   *
   * <attribute> ::= <key> = <value>
   * 1. 普通节点 执行 setProps 🪝
   * 2. 组件节点 收集映射关系，或 产生 computed
   */
  attributeList(_node: any) {
    let key: string, eq: any;
    const data = this.getData();
    while ((this.tokenizer.token.type & TokenType.NewLine) === 0) {
      // 取 key
      if (key == null) {
        key = this.tokenizer.token.value as any;
      }
      // 取 =
      else if (eq == null) {
        eq = '=';
      }
      // 取 value
      else {
        const [hookType, value, hookI] = this.tokenizer._hook({});
        const rawVal = data[Keys.Raw][value];
        const isFn = typeof rawVal === 'function';
        // 动态的要做成函数
        if (hookType === 'dynamic') {
          const valueIsMapKey = Reflect.has(data[Keys.Raw], value);
          const fn = isFn
            ? rawVal
            : valueIsMapKey
              ? value
              : new Function('data', `let v;with(data){v=${value}};return v;`).bind(undefined, data);
          this.onePropParsed(data, _node, key, fn, valueIsMapKey, isFn, hookI);
        }
        // 静态
        else if (hookType === 'static') {
          this.onePropParsed(data, _node, key, value, false, isFn, hookI);
        }
        // 基础数据字面量
        else {
          this.onePropParsed(data, _node, key, value, false, isFn, hookI);
        }
        key = null;
        eq = null;
      }
      this.tokenizer.nextToken();
    }
  }
  config(opt: TerpConf) {
    Object.assign(this, opt);
    this.opt = opt;
  }

  createNode(name: string) {
    return {
      name,
      props: {},
      nextSibling: null
    };
  }

  nextSib(node: any) {
    return node.nextSibling;
  }

  firstChild(node: any) {
    return node.firstChild;
  }

  _createAnchor() {
    const anchor = this.createAnchor();
    anchor[IsAnchor] = true;
    return anchor;
  }
  createAnchor() {
    return {
      name: 'anchor',
      nextSibling: null
    };
  }

  insertAfter(parent: any, node: any, prev: any) {
    return this.defaultInsert(parent, node, prev);
  }
  defaultInsert(parent: any, node: any, prev: any) {
    if (prev) {
      const next = prev.nextSibling;
      prev.nextSibling = node;
      node.nextSibling = next;
    } else {
      const next = parent.firstChild;
      parent.firstChild = node;
      node.nextSibling = next;
    }
  }

  remove(node: any, parent?: any, prev?: any) {
    return this.defaultRemove(node, parent, prev);
  }
  // TODO: 默认改成 prevItem
  defaultRemove(node: any, parent: any, prevSibling: any) {
    const next = node.nextSibling;
    if (prevSibling) {
      prevSibling.nextSibling = next;
    }
    if (parent.firstChild === node) {
      parent.firstChild = next;
    }
  }

  setProp(node: any, key: string, value: any, hookI?: number) {
    node.props[key] = value;
  }
}
