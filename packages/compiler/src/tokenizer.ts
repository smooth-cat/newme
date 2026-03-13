import { isNum, matchIdStart, Queue } from 'bobe-shared';
import { BaseType, Hook, HookProps, HookType, Token, TokenType } from './type';

export class Tokenizer {
  /** 缩进大小 默认 2 */
  TabSize = 2;
  /** 缩进字符 */
  Tab = Array.from({ length: this.TabSize }, () => ' ').join('');
  /** Eof 标识符的值 */
  static EofId = `__EOF__${Date.now()}`;
  static DedentId = `__DEDENT__${Date.now()}`;

  /** 当前 token */
  token!: Token;
  /** 回车后需要判断缩进 */
  needIndent = false;
  /** 用于跳过第一个节点前的空白字符串，以及生成基础缩进 */
  isFirstToken = true;
  /** 代码 */
  code: string;
  /** 记录历史缩进的长度，相对于行首 */
  dentStack: number[] = [0];
  /** 当前字符 index */
  i = 0;
  // TODO: 生产环境不需要这个，导致不必要的内存占用
  handledTokens: Token[] = [];
  /**
   * 有些标识符能产生多个 token
   * 例如 dedent
   * parent1
   *   child
   *     subChild
   * parent2 <- 产生两个 dedent
   */
  waitingTokens = new Queue<Token>();

  constructor(
    private hook: Hook,
    public isSubToken: boolean
  ) {
    if (isSubToken) {
      this.setToken(TokenType.Indent, '');
      this.isFirstToken = true;
      // this.waitingTokens.push({
      //   type: TokenType.Indent,
      //   typeName: TokenType[TokenType.Indent],
      //   value: ''
      // })
    }
  }
  consume() {
    const token = this.token;
    this.nextToken();
    return token;
  }
  // /** 恢复至某一个现场，进行 token 重算 */
  resume(_snapshot: ReturnType<Tokenizer['snapshot']>) {
    this.token = undefined;
    this.needIndent = false;
    this.isFirstToken = true;
    this.dentStack = [0];
    Object.assign(this, _snapshot);
  }
  snapshot() {
    return {
      i: this.i,
      waitingTokens: this.waitingTokens.clone()
    };
  }

  skip() {
    const logicDentLen = this.dentStack[this.dentStack.length - 1];
    let needIndent = false;
    /** \n 是为了弥补 if 节点 consume condition 后，已将 token 设置成回车 */
    let skipFragment = ``;
    this.token = undefined;
    while (1) {
      const char = this.code[this.i];

      if (char === '\n') {
        needIndent = true;
        skipFragment += char;
        this.i++;
        continue;
      }

      if (!needIndent) {
        skipFragment += char;
        this.i++;
        continue;
      }

      needIndent = false;
      // 此时已经指到一个非 tab 的字符
      const { value, isEmptyLine } = this.getDentValue();
      const currLen = value.length;
      if (isEmptyLine) continue;
      if (currLen > logicDentLen) {
        skipFragment += value;
      }
      // 找到与条件节点同级或更短的缩进了，结束。
      else {
        // skipFragment += `\n${Tokenizer.EofId}`;
        // 一直找到最小
        for (let i = this.dentStack.length - 1; i >= 0; i--) {
          const expLen = this.dentStack[i];
          // 等于
          if (currLen === expLen) break;

          // 大于
          if (currLen > expLen) {
            throw SyntaxError(`缩进错误，缩进长度不匹配`);
          }

          //  小于 expLen 检查是否是基础缩进
          if (this.shorterThanBaseDentEof()) {
            break;
          }

          this.dentStack.pop();

          if (!this.token) {
            this.setToken(TokenType.Dedent, String(expLen));
          } else {
            this.waitingTokens.push({
              type: TokenType.Dedent,
              typeName: TokenType[TokenType.Dedent],
              value: String(expLen)
            });
          }
        }
        break;
      }
    }
    if (!this.token) {
      this.nextToken();
    }
    return skipFragment;
  }

  setCode(code: string) {
    // 保证开头结尾能正确计算
    this.code = '\n' + code.trimEnd() + `\n${Tokenizer.EofId}`;
  }

  tokenize() {
    do {
      this.nextToken();
      console.log('token:', TokenType[this.token?.type], JSON.stringify(this.token?.value || ''));
    } while (!this.isEof());
  }

  isEof() {
    // 刚开始时 token 不存在
    if (!this.token) return false;
    return this.token.type & TokenType.Identifier && this.token.value === Tokenizer.EofId;
    // return this.code[this.i] === undefined;
  }

  private setToken(type: TokenType, value: BaseType) {
    this.token = {
      type,
      typeName: TokenType[type],
      value
    };
    this.isFirstToken = false;
  }

  public nextToken(): Token {
    try {
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
          this.dent();
          // 遍历到当前标识符非 空白为止
        } else {
          const char = this.code[this.i];
          switch (char) {
            case '\t':
            case ' ':
              // skip, 缩进通过 \n 匹配来激活 needIndent
              break;
            // 找后续所有 newLine
            case '\n':
              this.newLine();
              // 回车后需要判断缩进
              this.needIndent = true;
              break;
            case '=':
              this.assignment();
              break;
            case '|':
              this.pipe();
              break;
            case "'":
            case '"':
              this.str(char);
              break;
            case '{':
              this.brace();
              break;
            case '$':
              const handled = this.dynamic(char);
              if (handled) break;
            default:
              if (isNum(char)) {
                this.number(char);
                break;
              }
              if (typeof char === 'string' && matchIdStart(char)) {
                this.identifier(char);
              }
              break;
          }
          // 指向下一个字符
          this.i++;
        }

        // 找到 token 即可停止
        if (this.token) {
          break;
        }
      }
      return this.token;
    } catch (error) {
      console.error(error);
      return this.token;
    } finally {
      this.handledTokens.push(this.token);
    }
  }

  private assignment() {
    this.setToken(TokenType.Assign, '=');
  }
  private pipe() {
    this.setToken(TokenType.Pipe, '|');
  }
  private dynamic(char: string) {
    let nextC = this.code[this.i + 1];
    // 不是动态插值
    if (nextC !== '{') {
      return false;
    }
    this.i++;
    let value = '${';
    let innerBrace = 0;
    while (1) {
      nextC = this.code[this.i + 1];
      value += nextC;
      // 下一个属于本标识符再前进
      this.i++;
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
  }

  private brace() {
    let inComment: string,
      inString: string,
      count = 0,
      value = '',
      backslashCount = 0; // 用于记录连续的反斜杠数量
    while (1) {
      const char = this.code[this.i];
      const nextChar = this.code[this.i + 1];

      // 1. 处理注释状态退出
      if (inComment === 'single' && char === '\n') {
        inComment = null;
      } else if (inComment === 'multi' && char === '*' && nextChar === '/') {
        inComment = null;
        value += this.code[this.i];
        this.i++;
      }
      // 2. 如果不在注释中，处理字符串状态
      else if (inString) {
        // 退出字符串
        if (char === inString && backslashCount % 2 === 0) {
          inString = null;
        }
        backslashCount = char === '\\' ? backslashCount + 1 : 0;
      } else {
        // 3. 进入注释或字符串状态
        if (char === '/' && nextChar === '/') {
          inComment = 'single';
          value += this.code[this.i]; // 跳过 / 号
          this.i++;
        } else if (char === '/' && nextChar === '*') {
          inComment = 'multi';
          value += this.code[this.i]; // 跳过 / 号
          this.i++;
        } else if (char === "'" || char === '"' || char === '`') {
          inString = char;
        }
        // 4. 只有在非字符串、非注释状态下才计数
        else if (char === '{') {
          count++;
        } else if (char === '}') {
          count--;
        }
      }

      if (count === 0 && inString == null && inComment == null) {
        this.setToken(TokenType.InsertionExp, value.slice(1));
        return;
      }
      value += this.code[this.i];
      this.i++;
    }
  }

  private newLine() {
    let value = '\n';
    let nextC;
    while (1) {
      nextC = this.code[this.i + 1];
      if (nextC !== '\n') {
        break;
      }
      value += nextC;
      // 下一个属于本标识符再前进
      this.i++;
    }
    // Program 希望第一个 token 一定是 node 节点
    if (this.isFirstToken) {
      return;
    }
    this.setToken(TokenType.NewLine, value);
  }
  private getDentValue() {
    let value = '';
    let nextC;
    let isEmptyLine = false;
    // 构建缩进字符串
    while (1) {
      const nextChar = this.code[this.i];

      switch (nextChar) {
        case '\t':
          nextC = this.Tab;
          break;
        case ' ':
          nextC = ' ';
          break;
        case '\n':
          nextC = '\n';
          break;
        default:
          nextC = '';
          break;
      }

      // \n 空白 \n 的情况，这行不算
      if (nextC === '\n') {
        isEmptyLine = true;
        break;
      }
      if (!nextC) {
        break;
      }
      value += nextC;
      this.i++;
    }
    return {
      value,
      isEmptyLine
    };
  }
  private dent() {
    const { value, isEmptyLine } = this.getDentValue();
    if (isEmptyLine) {
      // 这种情况下需要 next ，即后续从 \n 重新开始匹配
      this.needIndent = true;
      return;
    }
    // 比较长度，比上个 indent 长，缩进，比上个 indent 短，dedent
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
      this.setToken(TokenType.Indent, currLen);
      return indentHasLen;
    }
    if (currLen < prevLen) {
      // 一直找到最小
      for (let i = this.dentStack.length; i--; ) {
        const expLen = this.dentStack[i];
        // 等于
        if (currLen === expLen) break;
        // 夹在两者说明缩进大小有问题
        if (currLen > expLen) {
          throw SyntaxError('缩进大小不统一');
        }
        //  小于 expLen 检查是否是基础缩进
        if (this.shorterThanBaseDentEof()) {
          return;
        }
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
      }
      return indentHasLen;
    }
    // 同级则无视
    return indentHasLen;
  }

  private shorterThanBaseDentEof() {
    const yes = this.dentStack.length === 1;
    if (yes) {
      if (!this.token) {
        // 子 tokenizer 使用 Dedent 推出 component 节点后，将 tokenizer 切换为 上一个 TokenSwitcher 的 tkr
        if (this.isSubToken) {
          this.setToken(TokenType.Dedent, '');
        } else {
          this.setToken(TokenType.Identifier, Tokenizer.EofId);
        }
      } else {
        if (this.isSubToken) {
          this.waitingTokens.push({
            type: TokenType.Dedent,
            typeName: TokenType[TokenType.Dedent],
            value: ''
          });
        } else {
          this.waitingTokens.push({
            type: TokenType.Identifier,
            typeName: TokenType[TokenType.Identifier],
            value: Tokenizer.EofId
          });
        }
      }
    }
    return yes;
  }

  private identifier(char: string) {
    let value = char;
    let nextC;
    while (1) {
      nextC = this.code[this.i + 1];
      if (typeof nextC !== 'string' || !matchIdStart(nextC)) {
        break;
      }
      value += nextC;
      this.i++;
    }
    if (value === Tokenizer.EofId && this.isSubToken) {
      this.setToken(TokenType.Dedent, '');
      return;
    }

    let realValue =
      value === 'null'
        ? null
        : value === 'undefined'
          ? undefined
          : value === 'false'
            ? false
            : value === 'true'
              ? true
              : value;
    this.setToken(TokenType.Identifier, realValue);
  }
  private str(char: string) {
    let value = '';
    let nextC;
    let continuousBackslashCount = 0;
    while (1) {
      nextC = this.code[this.i + 1];
      const memoCount = continuousBackslashCount;
      if (nextC === '\\') {
        continuousBackslashCount++;
      } else {
        continuousBackslashCount = 0;
      }
      this.i++;
      /**
       * 引号前 \ 为双数时，全都是字符 \
       *  */
      if (nextC === char && memoCount % 2 === 0) {
        break;
      }
      value += nextC;
    }
    this.setToken(TokenType.Identifier, value);
  }
  private number(char: string) {
    let value = char;
    let nextC;
    while (1) {
      nextC = this.code[this.i + 1];
      if (!isNum(nextC)) {
        break;
      }
      value += nextC;
      this.i++;
    }
    this.setToken(TokenType.Identifier, Number(value));
  }
  private eof() {
    this.setToken(TokenType.Eof, 'End Of File');
  }
  /** 模板字符串动态节点的占位符 */
  HookId = '_h_o_o_k_';
  /** 模板字符串动态节点索引 */
  hookI = 0;
  _hook = (props: Partial<HookProps>): [HookType | undefined, any, hookI?: any] => {
    const value = this.token.value;
    const isDynamicHook = this.token.type & TokenType.InsertionExp;
    const isStaticHook = typeof value === 'string' && value.indexOf(this.HookId) === 0;
    const hookType: HookType = isDynamicHook ? 'dynamic' : isStaticHook ? 'static' : undefined;
    // 静态插值 `${xxx}`
    if (this.hook && isStaticHook) {
      const hookI = Number(value.slice(this.HookId.length));
      const res = this.hook({
        ...props,
        HookId: this.HookId,
        i: hookI
      });
      // TODO: 去除 this.hookI, hookI 由本函数返回
      return [hookType, res, hookI];
    }
    // 动态插值 `{xxx}`
    else if (isDynamicHook) {
      return [hookType, value];
    }
    // 普通值
    return [hookType, value];
  };

  init(fragments: string | string[]) {
    if (typeof fragments === 'string') {
      this.setCode(fragments);
    } else {
      let code = '';
      for (let i = 0; i < fragments.length - 1; i++) {
        const fragment = fragments[i];
        code += fragment + `${this.HookId}${i}`;
      }
      this.setCode(code + fragments[fragments.length - 1]);
    }
  }
}
