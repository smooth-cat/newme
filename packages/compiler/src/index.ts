import { Tokenizer } from './tokenizer';
import { Hook, HookProps, LogicType, StackItem, TokenType } from './type';

export class Interpreter {
  /** 模板字符串动态节点的占位符 */
  HookId = '_h_o_o_k_';
  /** 用于渲染的数据 */
  data: Record<any, any> = {};
  /** 模板字符串动态节点索引 */
  hookI = 0;
  constructor(private tokenizer: Tokenizer) {}
  /**
   * 根节点：
   * 是 一个节点列表
   * <program> ::= <nodeList>
   */
  program() {
    // 初始化第一个 token
    this.tokenizer.consume();
    const _program = this.createRoot();
    this.nodeList(_program);
    return _program;
  }

  stack: StackItem[] = [];

  experimentalProgram() {
    this.tokenizer.consume();
    let current: any;
    let prevSibling: any;
    const rootList: any[] = [];
    while (1) {
      if (this.tokenizer.isEof()) {
        rootList.push(current);
        break;
      }

      const token = this.tokenizer.token;
      // 下沉，创建 child0
      if (token.type & TokenType.Indent) {
        const INDENT = this.tokenizer.consume();
        this.stack.push({
          prevSibling,
          node: current
        });
        // 第 0 个节点没有前置节点
        prevSibling = null;
        current = this.declaration();
      }
      // 下一个可能是 同级节点 或 Dedent
      else {
        // 将当前节点插入父节点
        if (current) {
          if (this.stack.length) {
            const parent = this.stack[this.stack.length - 1].node;
            this.insert(parent, current, prevSibling);
          } else {
            rootList.push(current);
          }
        }

        // 下一个 token 是 Dedent
        if (this.tokenizer.token.type & TokenType.Dedent) {
          const DEDENT = this.tokenizer.consume();
          const { node: parent, prevSibling: prevParent } = this.stack.pop();
          prevSibling = prevParent;
          current = parent;
        }
        // 下一个是 同级节点
        else {
          prevSibling = current;
          current = this.declaration();
        }
      }
    }
    return rootList;
  }

  /**
   * 节点列表：
   * 可以是一个节点，也可以跟随更多节点
   * <nodeList> ::= <node> <nodeList> <EOF|Dedent>
   *               |
   */
  nodeList(parent: any) {
    let _node: any;
    let prevSibling: any;
    let prevItem: any;
    let anchor: any;
    while (1) {
      // 对于 Program    EOF 表示 list 遍历完成
      if (this.tokenizer.isEof()) {
        return;
      }

      // 对于 childList  Dedent 表示 childList 遍历完成
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.consume();
        return;
      }
      _node = this.node();

      // 父节点是 if 采用 if.children.push 的方式采集
      // 父节点不是 if 采用 insert 进行采集
      const insert = parent.__logicType ? this.defaultInsert : this.insert.bind(this);
      const remove = parent.__logicType ? this.defaultRemove : this.remove.bind(this);

      // 子节点不是 if，直接插入单个子节点
      if (!_node.__logicType) {
        const realPrev = this.getPrevRealSibling(prevSibling);
        const currItem = insert(parent, _node, realPrev, prevItem);
        prevItem = currItem;
        prevSibling = _node;
        continue;
      }

      if (prevSibling) {
        _node.anchor = prevSibling;
      }
      // 没有 prevSibling 且父是 logic
      else if (parent.__logicType) {
        _node.anchor = parent;
      }
      // 父节点是普通节点，确实前面没有东西，anchor => null
      else {
      }
      this.effect(() => {
        // 子节点是 if，将 child 插入到
        if (_node.child && _node.condition()) {
          let item = _node.child;
          while (item != null) {
            const { value: child } = item;
            const realPrev = this.getPrevRealSibling(prevSibling);
            const currItem = insert(parent, child, realPrev, prevItem);
            item = item.next;
            prevItem = currItem;
            prevSibling = child;
          }
        }
      });
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
   * 单个节点：
   * 由声明部分和（可选的）子节点块组成
   * <node> ::= <declaration> <childrenBlockOpt>
   *  */
  node() {
    const _declaration: any = this.declaration();
    // 条件为假时执行 skip 逻辑
    if (_declaration.__logicType & LogicType.If && !_declaration.condition()) {
      return _declaration;
    }
    this.childrenBlockOpt(_declaration);
    return _declaration;
  }

  /**
   * 声明部分：
   * 包含首行定义和（可选的）多行属性扩展
   * <declaration> ::= <tagName=token> <headerLine> <extensionLines>
   *  */
  declaration() {
    const [isHook, value] = this._hook({});
    let _node: any;
    if (isHook) {
      const { tree, data } = value();
      _node = tree;
    } else if (value === 'if') {
      return this.ifDeclaration();
    } else {
      _node = this.createNode(value);
    }
    this.tokenizer.consume();
    this.headerLine(_node);
    this.extensionLines(_node);
    return _node;
  }

  ifDeclaration() {
    const ifIdentifier = this.tokenizer.consume();
    const [isHook, value] = this._hook({});
    const ifNode = {
      __logicType: LogicType.If,
      condition: value,
      child: null,
      lastChild: null,
      anchor: null,
      skip: null
    };
    this.effect(() => {
      const needMount = value();
      if (needMount) {
        const condition = this.tokenizer.consume();
        const newLine = this.tokenizer.consume();
      } else {
        ifNode.skip = this.tokenizer.skip();
        console.log('skip');
        console.log(ifNode.skip);
      }
    });
    return ifNode;
  }

  /**
   * <extensionLines> ::= PIPE <attributeList> NEWLINE <extensionLines>
   *                    | ε
   */
  extensionLines(_node: any) {
    while (1) {
      //  终止条件，下一行不是 pipe
      if (!(this.tokenizer.token.type & TokenType.Pipe)) {
        return;
      }
      // 开始解析 attributeList
      const PIPE = this.tokenizer.consume();
      this.attributeList(_node);
      // 文件结束了，通常不会发生
      if (!(this.tokenizer.token.type & TokenType.NewLine)) {
        return;
      }
      // 换行
      const NEWLINE = this.tokenizer.consume();
    }
  }

  /**
   * 首行：
   * 节点名称 + 属性列表 + 换行
   * <headerLine> ::= <attributeList> NEWLINE
   */
  headerLine(_node: any) {
    this.attributeList(_node);
    const NEWLINE = this.tokenizer.consume();
  }

  /**
   * 属性列表：
   * 可以是空的，或者包含多个属性
   * <attributeList> ::= <attribute> <attributeList>
   *                    | ε
   *
   * <attribute> ::= <key> <=> <value or dataKey> <=> <value>
   *
   */
  attributeList(_node: any) {
    let values: any[] = [];
    let prevToken = undefined;
    while (1) {
      // 前者是 id ，后者不是 =，values 可以组成属性赋值
      if (prevToken?.type === TokenType.Identifier && this.tokenizer.token.type !== TokenType.Assign) {
        const [v1, v2, v3] = values;
        const key: any = v1;
        let dataKey, defaultVal;
        if (v3 !== undefined) {
          defaultVal = v3;
          dataKey = v2;
        }
        // v2 有值，要区分其是 dataKey，还是默认值
        else if (v2 !== undefined) {
          // 区分 p=$abc 和 p=${haha} (编译时态)
          if (typeof v2 === 'string' && v2[0] === '$' && v2[1] !== '{') {
            dataKey = v2.slice(1);
          } else {
            defaultVal = v2;
          }
        }
        // v2 没值
        else {
          dataKey = key;
        }
        let val = defaultVal;
        if (dataKey) {
          val = this.setDataProp(this.data, dataKey, defaultVal);
        }
        this.setProp(_node, key, val, this.hookI - 1);
        const [isHook, value] = this._hook({});
        values = [value];
      }
      // 先存储
      else if (this.tokenizer.token.type !== TokenType.Assign) {
        const [isHook, value] = this._hook({});
        values.push(value);
      }

      // 已经不是 attr 相关的字符了
      if (!(this.tokenizer.token.type & (TokenType.Identifier | TokenType.Assign))) {
        break;
      }
      prevToken = this.tokenizer.consume();
    }
  }

  /** 子节点块：
   * 必须被缩进包裹
   * <childrenBlockOpt> ::= INDENT <nodeList>
   *                        | ε  /* 空（表示叶子节点，没有孩子）
   *  */
  childrenBlockOpt(parent: any) {
    // 无 children
    if (!(this.tokenizer.token.type & TokenType.Indent)) {
      return [];
    }
    const INDENT = this.tokenizer.consume();
    const list = this.nodeList(parent);
    return list;
  }

  config(
    opt: Partial<
      Pick<
        Interpreter,
        | 'createRoot'
        | 'createNode'
        | 'setProp'
        | 'setDataProp'
        | 'setChildren'
        | 'hook'
        | 'HookId'
        | 'effect'
        | 'insert'
      >
    >
  ) {
    Object.assign(this, opt);
  }

  createData(data: Record<any, any>) {
    return data;
  }
  setDataProp(data: Record<any, any>, key: any, value: any) {
    return (data[key] = value);
  }

  setChildren(node: any, children: any[]) {
    node.children = children;
  }

  createNode(name: string) {
    return {
      name,
      props: {}
    };
  }
  createRoot() {
    return this.createNode('root');
  }

  insert(parent: any, node: any, prevSibling: any, prevItem?: any) {
    return this.defaultInsert(parent, node, prevSibling, prevItem);
  }
  defaultInsert(parent: any, node: any, prevSibling: any, prevItem: any) {
    if (!parent.child) {
      return (parent.child = parent.lastChild =
        {
          value: node,
          next: null
        });
    }
    const nextItem = prevItem.next;
    const item = {
      value: node,
      next: nextItem
    };
    prevItem.next = item;
    if (!nextItem) {
      parent.lastChild = item;
    }
    return item;
  }

  remove(parent: any, node: any, prevSibling: any, prevItem: any) {
    return this.defaultRemove(parent, node, prevSibling, prevItem);
  }
  // TODO: 默认改成 prevItem
  defaultRemove(parent: any, node: any, prevSibling: any, prevItem: any) {
    const currItem = prevItem.next;
    const nextItem = currItem.next;
    if (prevItem) {
      if (nextItem) {
        prevItem.next = nextItem;
      } else {
        prevItem.next = null;
        parent.lastChild = prevItem;
      }
    } else {
      if (nextItem) {
        parent.child = nextItem;
      } else {
        parent.child = null;
        parent.lastChild = null;
      }
    }
    currItem.next = null;
  }

  setProp(node: any, key: string, value: any, hookI?: number) {
    node.props[key] = value;
  }

  effect: (fn: () => any) => any;

  init(fragments: string | string[]) {
    this.data = this.createData(this.data);
    if (typeof fragments === 'string') {
      this.tokenizer.setCode(fragments);
    } else {
      let code = '';
      for (let i = 0; i < fragments.length - 1; i++) {
        const fragment = fragments[i];
        code += fragment + `${this.HookId}${i}`;
      }
      this.tokenizer.setCode(code + fragments[fragments.length - 1]);
    }
  }
  hook: Hook;
  _hook = (props: Partial<HookProps>): [boolean, any] => {
    const value = this.tokenizer.token.value;

    const isHook = typeof value === 'string' && value.indexOf(this.HookId) === 0;
    if (this.hook && isHook) {
      const hookI = Number(value.slice(this.HookId.length));
      const res = this.hook({
        ...props,
        HookId: this.HookId,
        i: hookI
      });
      this.hookI++;
      return [isHook, res];
    }
    return [isHook, value];
  };
}

// const tokenizer = new Tokenizer();
// const cmp = new Interpreter(tokenizer);

// // 初始化
// cmp.config({
//   insert(parent, node) {
//     if (parent.children) {
//       parent.children.push(node);
//     } else {
//       parent.children = [node];
//     }
//     return undefined;
//   },
//   setDataProp(data, key, value) {
//     return (data[key] = value);
//   },
//   setProp(node: any, key: string, value: any, hookI?: number) {
//     node.props[key] = value;
//   }
// });
// cmp.init(`
// node1 k1=1
//   node1_1 k2=2 k3=3
//     node1_1_1 k6=6
// node2
// | p1=1
// | p2=2 p3=3
//   node2_1
//   | p4=4 p5=5 p6=6
//   node2_2
//   | p7=7
// node3 v1=1  v2=2 v3=3
//   node3_1 v4=4 v5=5 v6=6
// `);
// const res = cmp.experimentalProgram();
// console.log(JSON.stringify(res, undefined, 2));
