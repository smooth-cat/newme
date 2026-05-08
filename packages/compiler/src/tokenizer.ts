import { escapeMap, isNum, matchId, matchIdStart, matchIdStart2, Queue } from 'bobe-shared';
import {
  BaseType,
  Hook,
  HookProps,
  HookType,
  ParseErrorCode,
  ParseSyntaxError,
  Position,
  SourceLocation,
  Token,
  TokenType
} from './type';

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
  line = 0;
  column = 0;
  preCol = 0;
  preI = 0;
  needLoc = false;
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
  /** 当前文件路径 */
  source = '';

  constructor(
    private hook: Hook,
    public useDedentAsEof: boolean
  ) {
    if (useDedentAsEof) {
      this.initIndentWhenUseDedentAsEof();
      // this.waitingTokens.push({
      //   type: TokenType.Indent,
      //   typeName: TokenType[TokenType.Indent],
      //   value: ''
      // })
    }
  }
  initIndentWhenUseDedentAsEof() {
    this.setToken(TokenType.Indent, '');
    this.isFirstToken = true;
  }

  private next() {
    if (__IS_COMPILER__) {
      const char = this.code[this.i];
      if (char === '\n') {
        this.line++;
        this.column = 0;
      } else {
        this.column++;
      }
    }
    this.i++;
  }

  getCurrentPos(): Position {
    return {
      offset: this.i,
      line: this.line,
      column: this.column
    };
  }

  /** 构造从当前扫描起始位置到模板结尾的 SourceLocation，用于未闭合错误 */
  private unclosedLoc(startOffset: number, startLine: number, startCol: number): SourceLocation {
    const end = this.code.length - 1; // 去掉末尾 EofId 前的位置
    return {
      start: { offset: startOffset, line: startLine, column: startCol },
      end: { offset: end, line: this.line, column: this.column },
      source: this.code.slice(startOffset, end)
    };
  }

  private throwUnclosed(
    code: ParseErrorCode,
    message: string,
    startOffset: number,
    startLine: number,
    startCol: number
  ): never {
    throw new ParseSyntaxError(code, message, this.unclosedLoc(startOffset, startLine, startCol));
  }

  // /** 恢复至某一个现场，进行 token 重算 */
  resume({ dentStack, waitingTokens, ..._snapshot }: ReturnType<Tokenizer['snapshot']>) {
    this.token = undefined;
    this.needIndent = false;
    this.isFirstToken = true;
    this.dentStack = dentStack ? dentStack.slice() : [0];
    if (waitingTokens) {
      this.waitingTokens = waitingTokens.clone();
    }
    Object.assign(this, _snapshot);
  }
  snapshot(keys?: (keyof Tokenizer)[], dtI = 0): Partial<Tokenizer> {
    const snap = {
      i: this.i + dtI,
      waitingTokens: this.waitingTokens.clone()
    };
    if (keys) {
      for (const k of keys) {
        snap[k] = this[k];
        if (k === 'dentStack') {
          snap[k] = this[k].slice();
        }
      }
    }
    return snap;
  }

  skip(targetDentLen?: number) {
    if (targetDentLen == undefined) {
      targetDentLen = this.dentStack[this.dentStack.length - 1];
    }
    let needIndent = false;
    /** \n 是为了弥补 if 节点 consume condition 后，已将 token 设置成回车 */
    let skipFragment = ``;
    this.token = undefined;
    while (1) {
      const char = this.code[this.i];

      if (char === '\n') {
        needIndent = true;
        skipFragment += char;
        this.next();
        continue;
      }

      if (!needIndent) {
        skipFragment += char;
        this.next();
        continue;
      }

      needIndent = false;
      // 此时已经指到一个非 tab 的字符
      const { value, isEmptyLine } = this.getDentValue();
      const currLen = value.length;
      if (isEmptyLine) continue;
      if (currLen > targetDentLen) {
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
            throw new ParseSyntaxError(ParseErrorCode.INCONSISTENT_INDENT, '缩进大小不统一', this.emptyLoc());
          }

          //  小于 expLen 检查是否是基础缩进
          if (this.shorterThanBaseDentEof()) {
            break;
          }
          this.dentStack.pop();
          // 比目标值大，这一行被跳过了，不需要记录反缩进
          if (expLen > targetDentLen) {
            continue;
          }
          if (!this.token) {
            this.setToken(TokenType.Dedent, String(expLen));
          } else {
            this.waitingTokens.push({
              type: TokenType.Dedent,
              typeName: TokenType[TokenType.Dedent],
              value: String(expLen),
              // TODO: 暂时不做缩进位置
              loc: null
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

  private setToken(type: TokenType, value: BaseType, dt = 1) {
    this.token = {
      type,
      typeName: TokenType[type],
      value,
      loc:
        __IS_COMPILER__ && this.needLoc
          ? {
              start: {
                offset: this.preI,
                line: this.line,
                column: this.preCol
              },
              end: {
                offset: this.i + dt,
                line: this.line,
                column: this.column + dt
              },
              // TODO: 文件名
              source: this.code.slice(this.preI, this.i + dt)
            }
          : null
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
          this.locStart();
          this.dent();
          this.locEnd();
          // 遍历到当前标识符非 空白为止
        } else {
          const char = this.code[this.i];
          switch (char) {
            case '\t':
            case ' ':
              // skip, 缩进通过 \n 匹配来激活 needIndent
              break;
            /*----------------- 需要 loc 的 token -----------------*/
            default:
              this.locStart();
              switch (char) {
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
                case ';':
                  this.setToken(TokenType.Semicolon, ';');
                  break;
                case '/':
                  this.comment();
                  break;
                case "'":
                case '"':
                  this.str(char);
                  break;
                case '{':
                  const braceToken = this.brace();
                  this.setToken(TokenType.InsertionExp, braceToken);
                  break;
                case '$':
                  const handled = this.staticIns();
                  if (handled) break;
                default:
                  if (isNum(char)) {
                    this.number(char);
                    break;
                  }
                  if (typeof char === 'string' && matchIdStart2(char, 0)) {
                    this.identifier(char);
                  }
                  break;
              }
              this.locEnd();
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
    } catch (error) {
      throw error;
    } finally {
      this.handledTokens.push(this.token);
    }
  }

  locStart() {
    if (__IS_COMPILER__) {
      this.preCol = this.column;
      this.preI = this.i;
      this.needLoc = true;
    }
  }
  locEnd() {
    if (__IS_COMPILER__) {
      this.needLoc = false;
    }
  }

  getComment() {
    let value = '/';
    let nextC = this.code[this.i + 1];
    if (nextC !== '/') {
      throw new ParseSyntaxError(ParseErrorCode.MISSING_COMMENT_SECOND_SLASH, '注释开头必须是 //', this.emptyLoc());
    }
    while (this.code[this.i + 1] !== '\n') {
      this.next();
      value += this.code[this.i];
    }
    return value;
  }
  /**
   * 处理处于行末尾的 comment 例如：
   * div // 这里是注释
   */
  comment() {
    const value = this.getComment();
    // this.next(); // 设置当前字符为 /n
  }
  condExp() {
    this.locStart();

    let value = '';
    this.token = null;
    let char = this.code[this.i];
    while (char !== '\n') {
      if (char === '"' || char === "'") {
        value += char + this.getStr(char);
      }
      value += this.code[this.i];
      this.next();
      char = this.code[this.i];
    }
    // 此时 i -> \n
    const trimmed = value.replace(/\/\/[\s\S]+/, '').trim();

    this.setToken(TokenType.Identifier, trimmed ? trimmed : true, 0);
    this.handledTokens.push(this.token);
    this.locEnd();
    return this.token;
  }
  isEol(i: number) {
    return this.code[i] === '\n' || this.code[i] === '/';
  }
  /**
   * 解析到 for 时使用这个方法获取 for 后方的子表达式
   * 表达式通过 “;” 分割
   * // 最多可有三个表达式
   * for arr ; item index; item.key
   * @returns {boolean} 是否含有 key
   */
  public jsExp() {
    this.locStart();

    this.token = null;
    let value = '';

    let char = this.code[this.i];
    while (char !== ';' && char !== '\n') {
      if (char === '"' || char === "'") {
        value += char + this.getStr(char);
      }
      value += this.code[this.i];
      this.next();
      char = this.code[this.i];
    }
    this.setToken(TokenType.Identifier, value, 0);
    this.handledTokens.push(this.token);
    this.locEnd();
    return this.token;
  }

  public peekChar() {
    let i = this.i;
    while (this.code[i] === ' ' || this.code[i] === '\t') {
      i++;
    }
    return this.code[i];
  }

  peekCharIsEol() {
    const char = this.peekChar();
    return char === '\n' || char === '/';
  }

  charIsEol(char: string) {
    return char === '\n' || char === '/';
  }

  private assignment() {
    this.setToken(TokenType.Assign, '=');
  }
  private pipe() {
    this.setToken(TokenType.Pipe, '|');
  }
  private staticIns() {
    const startOffset = this.preI,
      startLine = this.line,
      startCol = this.preCol;
    let nextC = this.code[this.i + 1];
    // 不是动态插值
    if (nextC !== '{') {
      return false;
    }
    this.next();
    let value = '';
    let innerBrace = 0;
    while (1) {
      nextC = this.code[this.i + 1];
      if (nextC === undefined) {
        this.throwUnclosed(ParseErrorCode.UNCLOSED_STATIC_INS, '未闭合的 "${...}"', startOffset, startLine, startCol);
      }
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
    this.setToken(TokenType.StaticInsExp, value.slice(0, -1));
    return true;
  }

  private brace() {
    const startOffset = this.preI,
      startLine = this.line,
      startCol = this.preCol;
    let inComment: string,
      count = 0,
      value = '';
    while (1) {
      const char = this.code[this.i];
      if (char === undefined) {
        this.throwUnclosed(ParseErrorCode.UNCLOSED_BRACE, '未闭合的 "{"', startOffset, startLine, startCol);
      }
      const nextChar = this.code[this.i + 1];
      if (inComment === 'single' && char === '\n') {
        inComment = null;
      } else if (inComment === 'multi' && char === '*' && nextChar === '/') {
        inComment = null;
        value += this.code[this.i];
        this.next();
      } else {
        // 3. 进入注释或字符串状态
        if (char === '/' && nextChar === '/') {
          inComment = 'single';
          value += this.code[this.i]; // 跳过 / 号
          this.next();
        } else if (char === '/' && nextChar === '*') {
          inComment = 'multi';
          value += this.code[this.i]; // 跳过 / 号
          this.next();
        } else if (char === "'" || char === '"') {
          // 此时 i 指向尾 '
          value += char + this.getStr(char);
        }
        // 4. 只有在非字符串、非注释状态下才计数
        else if (char === '{') {
          count++;
        } else if (char === '}') {
          count--;
        }
      }

      if (count === 0 && inComment == null) {
        return value.slice(1);
      }
      value += this.code[this.i];
      this.next();
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
      this.next();
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
        case '/':
          nextC = '/';
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
      if (nextC === '/') {
        // 获取到下一个字符是 \n 为止
        value += this.getComment();
        this.next(); // 设置当前字符为 \n
        isEmptyLine = true;
        break;
      }
      if (!nextC) {
        break;
      }
      value += nextC;
      this.next();
    }
    return {
      value,
      isEmptyLine
    };
  }

  emptyLoc(): SourceLocation {
    const pos = this.getCurrentPos();
    return { start: pos, end: { offset: pos.offset + 1, line: pos.line, column: pos.column + 1 }, source: ' ' };
  }
  private dent() {
    const { value, isEmptyLine } = this.getDentValue();
    if (isEmptyLine) {
      // 这种情况下需要 next ，即后续从 \n 之后重新开始匹配
      this.needIndent = true;
      this.next();
      return;
    }
    this.needIndent = false;
    // 比较长度，比上个 indent 长，缩进，比上个 indent 短，dedent
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
      this.setToken(TokenType.Indent, currLen, 0);
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
          throw new ParseSyntaxError(ParseErrorCode.INCONSISTENT_INDENT, '缩进大小不统一', this.emptyLoc());
        }
        //  小于 expLen 检查是否是基础缩进
        if (this.shorterThanBaseDentEof()) {
          return;
        }
        this.dentStack.pop();
        if (!this.token) {
          this.setToken(TokenType.Dedent, String(expLen), 0);
        }
        // 多余的 dent 缓存在 waitingTokens
        else {
          this.waitingTokens.push({
            type: TokenType.Dedent,
            typeName: TokenType[TokenType.Dedent],
            value: String(expLen),
            // TODO: 暂时不做缩进位置
            loc: null
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
        if (this.useDedentAsEof) {
          this.setToken(TokenType.Dedent, '');
        } else {
          this.setToken(TokenType.Identifier, Tokenizer.EofId);
        }
      } else {
        if (this.useDedentAsEof) {
          this.waitingTokens.push({
            type: TokenType.Dedent,
            typeName: TokenType[TokenType.Dedent],
            value: '',
            // TODO: 暂时不做缩进位置
            loc: null
          });
        } else {
          this.waitingTokens.push({
            type: TokenType.Identifier,
            typeName: TokenType[TokenType.Identifier],
            value: Tokenizer.EofId,
            // TODO: 暂时不做缩进位置
            loc: null
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
      if (typeof nextC !== 'string' || !matchId(nextC, 0)) {
        break;
      }
      value += nextC;
      this.next();
    }
    if (value === Tokenizer.EofId && this.useDedentAsEof) {
      this.setToken(TokenType.Dedent, '');
      return;
    }

    let realValue: any, tokenType: TokenType;

    switch (value) {
      case 'null':
        realValue = null;
        tokenType = TokenType.Null;
        break;
      case 'undefined':
        realValue = undefined;
        tokenType = TokenType.Undefined;
        break;
      case 'false':
        realValue = false;
        tokenType = TokenType.Boolean;
        break;
      case 'true':
        realValue = true;
        tokenType = TokenType.Boolean;
        break;
      default:
        realValue = value;
        tokenType = TokenType.Identifier;
        break;
    }
    this.setToken(tokenType, realValue);
  }
  getStr(head: string, parseEscape = true) {
    const startOffset = this.preI,
      startLine = this.line,
      startCol = this.preCol;
    let value = '';
    let nextC;
    let continuousBackslashCount = 0;
    while (1) {
      nextC = this.code[this.i + 1];
      if (nextC === undefined) {
        this.throwUnclosed(ParseErrorCode.UNCLOSED_STRING, '未闭合的字符串字面量', startOffset, startLine, startCol);
      }
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
      if (nextC === head && memoCount % 2 === 0) {
        break;
      }
      const mapped = escapeMap[nextC];
      if (!__IS_COMPILER__ && parseEscape && mapped) {
        value += mapped;
      } else {
        value += nextC;
      }
    }
    return value;
  }

  private str(char: string) {
    const value = this.getStr(char, false);
    this.setToken(TokenType.String, value);
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
      this.next();
    }
    this.setToken(TokenType.Number, Number(value));
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
    let isStaticHook: boolean;
    if (__IS_COMPILER__) {
      isStaticHook = Boolean(this.token.type & TokenType.StaticInsExp);
    } else {
      isStaticHook = typeof value === 'string' && value.indexOf(this.HookId) === 0;
    }
    const hookType: HookType = isDynamicHook ? 'dynamic' : isStaticHook ? 'static' : undefined;
    // 静态插值 `${xxx}`
    if (this.hook && isStaticHook) {
      const hookI = Number((value as any as string).slice(this.HookId.length));
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
