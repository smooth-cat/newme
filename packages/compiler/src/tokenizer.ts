import { isNum, Queue } from '../../shared/util';
import { BaseType, Token, TokenType } from './type';

export class Tokenizer {
  /** 缩进大小 默认 2 */
  TabSize = 2;
  /** 缩进字符 */
  Tab = Array.from({ length: this.TabSize }, () => ' ').join('');
  /** 匹配标识符 */
  IdExp = /[\d\w\/]/;
  /** Eof 标识符的值 */
  static EofId = `__EOF__${Date.now()}`;

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

  constructor() {}
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
    const dentLen = this.dentStack[this.dentStack.length - 1];
    let needIndent = false;
    /** \n 是为了弥补 if 节点 consume condition 后，已将 token 设置成回车 */
    let skipFragment = ``;
    this.token = undefined;
    while (1) {
      const char = this.char;

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
      if(isEmptyLine) continue;
      if (value.length > dentLen) {
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
          //  小于 expLen
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
    // return this.char === undefined;
  }

  get char() {
    return this.code[this.i];
  }
  get prev() {
    return this.code[this.i - 1];
  }
  get after() {
    return this.code[this.i + 1];
  }

  private next() {
    const prev = this.code[this.i];
    this.i++;
    const curr = this.code[this.i];
    return [prev, curr] as [prev: string, curr: string];
  }

  private setToken(type: TokenType, value: BaseType) {
    this.token = {
      type,
      typeName: TokenType[type],
      value
    };
    this.isFirstToken = false;
  }

  private testId(value: string) {
    if (typeof value !== 'string') return false;
    return this.IdExp.test(value);
  }

  private nextToken() {
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
          let { char } = this;
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
            case '$':
              const handled = this.dynamic(char);
              if (handled) break;
            default:
              if (isNum(char)) {
                this.number(char);
                break;
              }

              if (this.testId(char)) {
                this.identifier(char);
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
    } catch (error) {
      console.error(error);
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
  }
  private newLine() {
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
  }
  private getDentValue() {
    let value = '';
    let nextC;
    let isEmptyLine = false;
    // 构建缩进字符串
    while (1) {
      const nextChar = this.char;

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
      this.next();
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
  private identifier(char: string) {
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
          : value === 'false'
            ? false
            : value === 'true'
              ? true
              : value;
    this.setToken(TokenType.Identifier, realValue);
  }
  private str(char: string) {
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
  }
  private number(char: string) {
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
  }
  private eof() {
    this.setToken(TokenType.Eof, 'End Of File');
  }
}
