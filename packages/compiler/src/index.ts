import { isNum, Queue } from '../../shared/util';

export enum TokenType {
  NewLine,
  Indent,
  Dedent,
  Identifier,
  Assign,
  Pipe,
  Eof
}

export type BaseType = string | number | boolean | undefined | null;

export type Token = {
  type: TokenType;
  typeName: string;
  value: BaseType;
};

export type HookProps = {
  /** 通过哪个 HookId 进入的 */
  HookId: string;
  /**  第几个 hook */
  i: number;
  /** 父节点 */
  parentNode?: any;
};
export type Hook = (props: HookProps) => any;

export class Compiler {
  i = 0;
  get char() {
    return this.code[this.i];
  }
  get prev() {
    return this.code[this.i - 1];
  }
  get after() {
    return this.code[this.i + 1];
  }

  at(i: number) {
    return this.code[i];
  }

  next() {
    const prev = this.code[this.i];
    this.i++;
    const curr = this.code[this.i];
    return [prev, curr] as [prev: string, curr: string];
  }

  token!: Token;
  tokenIs = (...types: TokenType[]) => {
    if (types.length === 1) return types[0] === this.token.type;
    return types.includes(this.token.type);
  };
  isEof = () => {
    // 刚开始时 token 不存在
    if (!this.token) return false;
    return this.tokenIs(TokenType.Identifier) && this.token.value === this.EofId;
  };
  setToken = (type: TokenType, value: BaseType) => {
    this.token = {
      type,
      typeName: TokenType[type],
      value
    };
    this.isFirstToken = false;
  };

  TabSize = 2;
  Tab = Array.from({ length: this.TabSize }, () => ' ').join('');
  IdExp = /[\d\w\/]/;
  EofId = `__EOF__${Date.now()}`;
  testId = (value: string) => {
    if (typeof value !== 'string') return false;
    return this.IdExp.test(value);
  };
  /** 记录历史缩进的长度，相对于行首 */
  dentStack: number[] = [0];
  needIndent = false;
  isFirstToken = true;
  /**
   * 有些标识符能产生多个 token
   * 例如 dedent
   * parent1
   *   child
   *     subChild
   * parent2 <- 产生两个 dedent
   */
  waitingTokens = new Queue<Token>();

  nextToken() {
    // 已遍历到文件结尾
    if (this.isEof()) {
      return this.token;
    }

    this.token = undefined as any;
    if (this.waitingTokens.len) {
      const item = this.waitingTokens.shift()!;
      this.setToken(item.type, item.value);
      return this.token;
    }

    outer: while (1) {
      if (this.needIndent) {
        const indentHasLen = this.tokenCreator.dent();
        // 遍历到当前标识符非 空白为止
      } else {
        let { char } = this;
        switch (char) {
          case '\t':
          case ' ':
            // skip, 缩进通过 \n 匹配来激活 needIndent
            break;
          // 找后续所有 newLine
          case '\n':
            this.tokenCreator.newLine();
            // 回车后需要判断缩进
            this.needIndent = true;
            break;
          case '=':
            this.tokenCreator.assignment();
            break;
          case '|':
            this.tokenCreator.pipe();
            break;
          case "'":
          case '"':
            this.tokenCreator.str(char);
            break;
          case '$':
            const handled = this.tokenCreator.dynamic(char);
            if (handled) break;
          default:
            if (isNum(char)) {
              this.tokenCreator.number(char);
              break;
            }

            if (this.testId(char)) {
              this.tokenCreator.identifier(char);
            }
            break;
        }
        // 指向下一个字符
        this.next();
      }

      // 找到 token 即可停止
      if (this.token) {
        break;
      }
    }
    return this.token;
  }

  private consume() {
    const token = this.token;
    this.nextToken();
    return token;
  }

  tokenize() {
    do {
      this.nextToken();
      console.log('token:', TokenType[this.token?.type], JSON.stringify(this.token?.value || ''));
    } while (!this.isEof());
  }

  tokenCreator = {
    assignment: () => {
      this.setToken(TokenType.Assign, '=');
    },
    pipe: () => {
      this.setToken(TokenType.Pipe, '|');
    },
    dynamic: (char: string) => {
      let nextC = this.after;
      // 不是动态插值
      if (nextC !== '{') {
        return false;
      }
      this.next();
      let value = '${';
      let innerBrace = 0;
      while (1) {
        nextC = this.after;
        value += nextC;
        // 下一个属于本标识符再前进
        this.next();
        if (nextC === '{') {
          innerBrace++;
        }

        if (nextC === '}') {
          // 内部无左括号，说明完成匹配 TODO: 考虑js注释中的括号可能导致匹配错误
          if (!innerBrace) {
            break;
          }
          innerBrace--;
        }
      }
      this.setToken(TokenType.Identifier, value);
      return true;
    },
    newLine: () => {
      let value = '\n';
      let nextC;
      while (1) {
        nextC = this.after;
        if (nextC !== '\n') {
          break;
        }
        value += nextC;
        // 下一个属于本标识符再前进
        this.next();
      }
      // Program 希望第一个 token 一定是 node 节点
      if (this.isFirstToken) {
        return;
      }
      this.setToken(TokenType.NewLine, value);
    },
    dent: () => {
      const handleDent = (v: string) => {
        switch (v) {
          case '\t':
            return this.Tab;
          case ' ':
            return ' ';
          case '\n':
            return '\n';
          default:
            return '';
        }
      };
      let value = '';
      let nextC;
      while (1) {
        const nextChar = this.char;
        nextC = handleDent(nextChar);
        // \n 空白 \n 的情况，这行不算
        if (nextC === '\n') {
          this.needIndent = true;
          // 这种情况下需要 next ，即后续从 \n 重新开始匹配
          return true;
        }
        // 比较长度，比上个 indent 长，缩进，比上个 indent 短，dedent
        if (!nextC) {
          this.needIndent = false;
          // 期望 firstToken 是 node，所以这里只要修改第一个节点的基础偏移值即可
          if (this.isFirstToken) {
            this.dentStack[0] = value.length;
            return;
          }
          let currLen = value.length;
          const indentHasLen = currLen > 0;
          const prevLen = this.dentStack[this.dentStack.length - 1];
          if (currLen > prevLen) {
            this.dentStack.push(currLen);
            this.setToken(TokenType.Indent, String(currLen));
            return indentHasLen;
          }
          if (currLen < prevLen) {
            // 一直找到最小
            for (let i = this.dentStack.length - 2; i >= 0; i--) {
              const expLen = this.dentStack[i];
              const prevExpLen = this.dentStack[i + 1];
              // 夹在两者说明缩进大小有问题
              if (currLen > expLen && currLen < prevExpLen) {
                throw SyntaxError('缩进大小不统一');
              }
              // current <= expLen 反缩进
              this.dentStack.pop();
              if (!this.token) {
                this.setToken(TokenType.Dedent, String(expLen));
              }
              // 多余的 dent 缓存在 waitingTokens
              else {
                this.waitingTokens.push({
                  type: TokenType.Dedent,
                  typeName: TokenType[TokenType.Dedent],
                  value: String(expLen)
                });
              }
              if (currLen === expLen) {
                break;
              }
            }
            return indentHasLen;
          }
          // 同级则无视
          return indentHasLen;
        }
        value += nextC;
        this.next();
      }
    },
    identifier: (char: string) => {
      let value = char;
      let nextC;
      while (1) {
        nextC = this.after;
        if (!this.testId(nextC)) {
          break;
        }
        value += nextC;
        this.next();
      }
      let realValue =
        value === 'null'
          ? null
          : value === 'undefined'
            ? undefined
            : value === 'false' || value === 'true'
              ? Boolean(value)
              : value;
      this.setToken(TokenType.Identifier, realValue);
    },
    str: (char: string) => {
      let value = '"';
      let nextC;
      let continuousBackslashCount = 0;
      while (1) {
        nextC = this.after;
        value += nextC;
        const memoCount = continuousBackslashCount;
        if (nextC === '\\') {
          continuousBackslashCount++;
        } else {
          continuousBackslashCount = 0;
        }
        this.next();
        /**
         * 引号前 \ 为双数时，全都是字符 \
         *  */
        if (nextC === char && memoCount % 2 === 0) {
          break;
        }
      }
      this.setToken(TokenType.Identifier, JSON.parse(value.slice(0, -1) + '"'));
    },
    number: (char: string) => {
      let value = char;
      let nextC;
      while (1) {
        nextC = this.after;
        if (!isNum(nextC)) {
          break;
        }
        value += nextC;
        this.next();
      }
      this.setToken(TokenType.Identifier, Number(value));
    },
    eof: () => {
      this.setToken(TokenType.Eof, 'End Of File');
    }
  };

  HookId = '_h_o_o_k_';
  data: Record<any, any> = {};
  public code: string;

  constructor() {}

  preprocess() {
    // 保证开头能通过 换行进行 indent 计算
    this.code = '\n' + this.code;
    // 保证结尾 dedent 能正常配对
    this.code = this.code.trimEnd() + `\n${this.EofId}`;
    // console.log(this.code);
  }

  /**
   * 根节点：
   * 是 一个节点列表
   * <program> ::= <nodeList>
   */
  program() {
    // 初始化第一个 token
    this.consume();
    return this.nodeList();
  }

  /**
   * 节点列表：
   * 可以是一个节点，也可以跟随更多节点
   * <nodeList> ::= <node> <nodeList> <EOF|Dedent>
   *               |
   */
  nodeList() {
    const { tokenIs } = this;
    const nodes: any[] = [];
    let _node: any;
    while (1) {
      // 对于 Program    EOF 表示 list 遍历完成
      if (this.isEof()) {
        return nodes;
      }

      // 对于 childList  Dedent 表示 childList 遍历完成
      if (tokenIs(TokenType.Dedent)) {
        this.consume();
        return nodes;
      }

      _node = this.node();
      nodes.push(_node);
    }
  }

  /**
   * 单个节点：
   * 由声明部分和（可选的）子节点块组成
   * <node> ::= <declaration> <childrenBlockOpt>
   *  */
  node() {
    const _declaration: any = this.declaration();
    _declaration.children = this.childrenBlockOpt();
    return _declaration;
  }

  /**
   * 声明部分：
   * 包含首行定义和（可选的）多行属性扩展
   * <declaration> ::= <tagName=token> <headerLine> <extensionLines>
   *  */
  declaration() {
    this.consume();
    const [isHook, value] = this._hook({});
    let _node: any;
    if (isHook) {
      const { tree, data } = value();
      _node = tree;
    } else {
      _node = this.createNode(value);
    }
    this.headerLine(_node);
    this.extensionLines(_node);
    return _node;
  }

  /**
   * <extensionLines> ::= PIPE <attributeList> NEWLINE <extensionLines>
   *                    | ε
   */
  extensionLines(_node: any) {
    const { tokenIs } = this;
    while (1) {
      //  终止条件，下一行不是 pipe
      if (!tokenIs(TokenType.Pipe)) {
        return;
      }
      // 开始解析 attributeList
      const PIPE = this.consume();
      this.attributeList(_node);
      // 文件结束了，通常不会发生
      if (!tokenIs(TokenType.NewLine)) {
        return;
      }
      // 换行
      const NEWLINE = this.consume();
    }
  }

  /**
   * 首行：
   * 节点名称 + 属性列表 + 换行
   * <headerLine> ::= <attributeList> NEWLINE
   */
  headerLine(_node: any) {
    this.attributeList(_node);
    const NEWLINE = this.consume();
  }

  /**
   * 属性列表：
   * 可以是空的，或者包含多个属性
   * <attributeList> ::= <attribute> <attributeList>
   *                    | ε
   *
   * <attribute> ::= <key> <=> <value or dataKey> <=> <value>
   */
  attributeList(_node: any) {
    let i = 0;
    let key = '';
    let dataKey: any = '';
    let defaultValue: any = undefined;
    let prevIsAssign = false;
    // 是标识符 或 赋值 就 继续累积 props
    while (this.tokenIs(TokenType.Identifier, TokenType.Assign)) {
      const [isHook, value] = this._hook({});

      if (value === '=') {
        prevIsAssign = true;
      }
      // 前一个不是等号，说明是 key
      else if (!prevIsAssign) {
        /*----------------- 开始下一个属性前进行赋值操作 -----------------*/
        // 只声明 key 时 dataKey === key
        if (!dataKey) {
          dataKey = key;
        }
        // 三者都有
        else if (defaultValue != null) {
        }
        // 第二个值是 dataKey 或 defaultValue，看其是否是 $ 开头
        else {
          const valueOrKey = dataKey;
          if (valueOrKey[0] === '$') {
            dataKey = dataKey.slice(1);
          }
          // 值
          else {
            defaultValue = dataKey;
            dataKey = undefined;
          }
        }

        this.setDataProp(this.data, dataKey, defaultValue);
        this.setProp(_node, key, this.data[dataKey], this.hookI - 1);
        key = value;
      }
      // 前一个是等号
      else {
        if (!dataKey) {
          dataKey = value;
        } else {
          defaultValue = value;
        }
      }

      this.consume();
      i++;
    }
  }

  config(opt: Partial<Pick<Compiler, 'createNode' | 'setProp' | 'hook' | 'HookId'>>) {
    Object.assign(this, opt);
  }

  createData(data: Record<any, any>) {
    return data;
  }
  setDataProp(data: Record<any, any>, key: any, value: any) {
    return (data[key] = value);
  }

  createNode(name: string) {
    return {
      name,
      props: {}
    };
  }
  setProp(node: any, key: string, value: any, hookI?: number) {
    node.props[key] = value;
  }

  init(fragments: string | string[]) {
    this.data = this.createData(this.data);
    if (typeof fragments === 'string') {
      this.code = fragments;
    } else {
      this.code = fragments.join(this.HookId);
    }
    return this.preprocess();
  }

  hook: Hook;
  _hook = (props: Partial<HookProps>): [boolean, any] => {
    const value = this.token.value;
    const isHook = value === this.HookId;
    if (this.hook && isHook) {
      const res = this.hook({
        ...props,
        HookId: this.HookId,
        i: this.hookI
      });
      this.hookI++;
      return [isHook, res];
    }
    return [isHook, value];
  };
  hookI = 0;

  /** 子节点块：
   * 必须被缩进包裹
   * <childrenBlockOpt> ::= INDENT <nodeList>
   *                        | ε  /* 空（表示叶子节点，没有孩子）
   *  */
  childrenBlockOpt() {
    // 无 children
    if (!this.tokenIs(TokenType.Indent)) {
      return;
    }
    const INDENT = this.consume();
    const list = this.nodeList();
    return list;
  }
}

type UpdateItem = {
  fn: (value: any) => any;
  old: any;
};

let ast: any;
const updateList: UpdateItem[] = [];
const cmp = new Compiler();
export function bobe(fragments: TemplateStringsArray, ...values: any[]) {
  // 增量更新
  if (ast) {
    updateList.forEach(({ old, fn }, i) => {
      const val = values[i];
      if (val !== old) {
        console.log('增量更新', val);
        fn(val);
      }
    });
    console.log(JSON.stringify(ast, undefined, 2));
    return ast;
  }
  // 初始化
  cmp.config({
    hook({ i }) {
      return values[i];
    },
    setProp(node: any, key: string, value: any, hookI?: number) {
      const fn = (v: any) => {
        node.props[key] = v;
        if (hookI != null) {
          updateList[hookI] = {
            fn,
            old: v
          };
        }
      };
      fn(value);
    }
  });
  cmp.init(Array.from(fragments));
  ast = cmp.program();
  console.log(JSON.stringify(ast, undefined, 2));
  return ast;
}

// bobe`
// node1 k1=1
//   node1_1 k2=false k3=3
//     node1_1_1 k6=null
// node2
// | p1=1
// | p2=2 p3='你好'
//   node2_1
//   | p4=4 p5=${{ v: '🤡' }} p6=6
//   node2_2
//   | p7=7 p8=\${{ v: '🤡' }} p9=aaa
// node3 v1=1  v2=2 v3=undefined
// `;
