import { Tokenizer } from './tokenizer';
import {
  NodeType,
  Program,
  TemplateNode,
  ElementNode,
  Property,
  PropertyValue,
  ConditionalNode,
  LoopNode,
  PropertyKeyNode,
  BaseNode,
  ComponentNode
} from './type-ast';
import {
  TokenType,
  ParseError,
  ParseErrorCode,
  ParseSyntaxError,
  SourceLocation,
  BaseTokenType,
  ValueTokenType
} from './type';

export class Compiler {
  errors: ParseError[] = [];

  constructor(
    public tokenizer: Tokenizer,
    public hooks: ParseHooks = {}
  ) {}

  private addError(code: ParseErrorCode, message: string, loc: SourceLocation, node?: BaseNode) {
    if (node) {
      node.hasError = true;
    }
    this.errors.push({ code, message, loc });
  }

  /**
   * 编译程序入口，生成AST
   */
  @NodeHook
  parseProgram(): Program {
    const body: TemplateNode[] = [];
    try {
      this.tokenizer.nextToken();

      // 解析文档主体内容
      while (!this.tokenizer.isEof()) {
        const node = this.templateNode(body);
        if (node) {
          body.push(node);
        }
      }
    } catch (error) {
      if (error instanceof ParseSyntaxError) {
        this.addError(error.code, error.message, error.loc);
      } else {
        this.addError(error.toString() as any, '未知错误', this.tokenizer.emptyLoc());
      }
    }

    return {
      type: NodeType.Program,
      body,
      loc: {
        start: { offset: 0, line: 1, column: 0 },
        end: { offset: this.tokenizer.preI, line: this.tokenizer.line, column: this.tokenizer.column },
        source: this.tokenizer.code
      }
    };
  }

  handleChildren(): TemplateNode[] {
    const children: TemplateNode[] = [];
    if (this.tokenizer.token.type & TokenType.Indent) {
      this.tokenizer.nextToken(); // 跳过缩进
      while (!(this.tokenizer.token.type & TokenType.Dedent) && !this.tokenizer.isEof()) {
        const child = this.templateNode(children);
        if (child) {
          children.push(child);
        }
      }
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.nextToken(); // 跳过去缩进
      }
    }
    return children;
  }

  /**
   * 解析模板节点
   */
  private templateNode(siblings: TemplateNode[]): TemplateNode | null {
    const token = this.tokenizer.token;

    // Pipe 出现在非属性扩展行上下文中
    if (token.type & TokenType.Pipe) {
      this.addError(
        ParseErrorCode.PIPE_IN_WRONG_CONTEXT,
        '"|" 只能出现在元素属性扩展行中',
        token.loc ?? this.tokenizer.emptyLoc()
      );
      this.tokenizer.nextToken(); // 跳过 |
      return null;
    }

    const [hookType, value] = this.tokenizer._hook({});

    const isElseOrFail = value === 'else' || value === 'fail';
    // 检查是否为特殊关键字
    if (value === 'if' || isElseOrFail) {
      if (isElseOrFail) {
        const lastSibling = siblings[siblings.length - 1];
        const lastType = lastSibling?.type;
        if (lastType !== NodeType.If && lastType !== NodeType.Else && lastType !== NodeType.Fail) {
          this.addError(
            ParseErrorCode.ELSE_WITHOUT_IF,
            `"${value}" 前必须有 "if" 或 "else" 节点`,
            token.loc ?? this.tokenizer.emptyLoc()
          );
        }
      }
      return this.parseConditionalNode();
    }
    if (value === 'for') {
      return this.parseLoopNode();
    }
    if (hookType) {
      return this.parseComponentNode();
    }
    // 解析普通元素节点
    return this.parseElementNode();
  }

  /**
   * 解析元素节点
   */
  @NodeHook
  @NodeLoc
  parseComponentNode(node?: ComponentNode) {
    const name = this.parseName();
    this.tokenizer.nextToken(); // 跳过标签名

    // 解析属性
    node.type = NodeType.Component;
    node.componentName = name;
    const props: Property[] = this.headerLineAndExtensions();
    node.props = props;
    this.hooks.parseComponentNode?.propsAdded?.call(this, node);

    // 解析子节点
    const children = this.handleChildren();

    node.children = children;
    return node;
  }
  /**
   * 解析元素节点
   */
  @NodeHook
  @NodeLoc
  parseElementNode(node?: ElementNode) {
    const tagToken = this.tokenizer.token;
    // 验证标签名
    if (!(tagToken.type & TokenType.Identifier)) {
      this.addError(
        ParseErrorCode.INVALID_TAG_NAME,
        `无效的标签名，期望标识符但得到 "${tagToken.value}"`,
        tagToken.loc ?? this.tokenizer.emptyLoc(),
        node
      );
      // 跳到下一个 NewLine 恢复
      while (!(this.tokenizer.token.type & TokenType.NewLine) && !this.tokenizer.isEof()) {
        this.tokenizer.nextToken();
      }
      return null;
    }
    // 获取标签名
    const tagName = tagToken.value as string;
    this.tokenizer.nextToken(); // 跳过标签名

    // 解析属性
    node.type = NodeType.Element;
    node.tagName = tagName;
    const props: Property[] = this.headerLineAndExtensions();
    node.props = props;
    this.hooks.parseElementNode?.propsAdded?.call(this, node);

    // 解析子节点
    const children = this.handleChildren();

    node.children = children;
    return node;
  }

  /**
   * 解析条件节点（if/else/fail）
   */
  @NodeHook
  @NodeLoc
  parseConditionalNode(node?: ConditionalNode) {
    const keyword = this.tokenizer.token.value as string;

    // 获取条件表达式
    this.tokenizer.condExp();
    const condition = this.parseJsExp();
    this.tokenizer.nextToken(); // 跳过 cond
    this.tokenizer.nextToken(); // 跳过 \n
    node.type = keyword === 'if' ? NodeType.If : keyword === 'else' ? NodeType.Else : NodeType.Fail;
    node.condition = condition;
    this.hooks.parseConditionalNode?.propsAdded?.call(this, node);
    // 解析条件成立时的内容
    const children = this.handleChildren();

    // if (children.length === 0) {
    //   this.addError('EMPTY_IF_BODY', `"${keyword}" 块没有子节点`, keywordLoc);
    // }

    node.children = children;

    return node;
  }

  /**
   * 解析循环节点（for）
   */
  @NodeHook
  @NodeLoc
  parseLoopNode(node?: LoopNode) {
    const forLoc = this.tokenizer.token.loc ?? this.tokenizer.emptyLoc();
    // 跳过 'for' 关键字，解析循环表达式
    this.tokenizer.jsExp();
    const collection = this.parseJsExp();

    if (!collection.value && collection.value !== 0) {
      this.addError(ParseErrorCode.MISSING_FOR_COLLECTION, '"for" 缺少集合表达式', forLoc, node);
    }

    const semicolonToken = this.tokenizer.nextToken(); // 期望分号
    if (!(semicolonToken.type & TokenType.Semicolon)) {
      this.addError(
        ParseErrorCode.MISSING_FOR_SEMICOLON,
        '"for" 语法：for <集合>; <item> [index][; key]，缺少第一个 ";"',
        semicolonToken.loc ?? this.tokenizer.emptyLoc(),
        node
      );
    }

    const itemToken = this.tokenizer.nextToken(); // item 表达式
    const isDestruct = itemToken.type === TokenType.InsertionExp;
    if (isDestruct) {
      itemToken.value = '{' + itemToken.value + '}';
    }
    const item = this.parseJsExp();

    if (!item.value && item.value !== 0) {
      this.addError(
        ParseErrorCode.MISSING_FOR_ITEM,
        '"for" 缺少 item 变量名',
        itemToken.loc ?? this.tokenizer.emptyLoc(),
        node
      );
    }

    let char = this.tokenizer.peekChar(),
      key: PropertyValue | undefined,
      index: PropertyValue | undefined;
    if (char === ';') {
      this.tokenizer.nextToken(); // 分号
      if (this.tokenizer.peekChar() !== '\n') {
        this.tokenizer.jsExp();
        key = this.parseJsExp();
      }
    } else if (char === '\n') {
    }
    // 下一个是 indexName
    else {
      this.tokenizer.nextToken();
      index = this.parseJsExp();
      if (this.tokenizer.peekChar() === ';') {
        this.tokenizer.nextToken(); // 分号
        if (this.tokenizer.peekChar() !== '\n') {
          this.tokenizer.jsExp();
          key = this.parseJsExp();
        }
      }
    }
    // 跳过最后一个表达式
    this.tokenizer.nextToken();
    // 跳过回车
    this.tokenizer.nextToken();
    node.type = NodeType.For;
    node.collection = collection;
    node.item = item;
    node.index = index;
    node.key = key;
    this.hooks.parseLoopNode?.propsAdded?.call(this, node);

    // 解析循环体
    const children = this.handleChildren();

    // if (children.length === 0) {
    //   this.addError('EMPTY_FOR_BODY', '"for" 块没有子节点', forLoc);
    // }

    node.children = children;

    return node;
  }

  /**
   * 解析首行和扩展行的属性
   */
  private headerLineAndExtensions(): Property[] {
    const props: Property[] = [];

    do {
      props.push(...this.attributeList());

      // 跳过换行符
      if (this.tokenizer.token.type & TokenType.NewLine) {
        this.tokenizer.nextToken();
      }
      // 不是 pipe 就结束
      if ((this.tokenizer.token.type & TokenType.Pipe) === 0) {
        break;
      } else {
        this.tokenizer.nextToken();
      }
    } while (true);

    return props;
  }

  /**
   * 解析属性列表
   */
  private attributeList(): Property[] {
    const props: Property[] = [];

    while (
      !(this.tokenizer.token.type & TokenType.NewLine) &&
      !(this.tokenizer.token.type & TokenType.Pipe) &&
      !this.tokenizer.isEof()
    ) {
      const prop = this.parseProperty();
      if (prop) {
        props.push(prop);
      }
    }

    return props;
  }

  @NodeHook
  parseProperty(node?: Property) {
    node.type = NodeType.Property;
    if (this.tokenizer.token.type !== TokenType.Identifier) {
      this.addError(
        ParseErrorCode.INVALID_PROP_KEY,
        `属性名 "${this.tokenizer.token.value}" 不合法`,
        this.tokenizer.token.loc ?? this.tokenizer.emptyLoc(),
        node
      );
      this.tokenizer.nextToken(); // 跳过key
      return null;
    }

    node.key = this.parsePropertyKey();
    const token = this.tokenizer.nextToken(); // 跳过key
    if (token.value !== '=') {
      this.addError(
        ParseErrorCode.MISSING_ASSIGN,
        `属性 "${node.key.key}" 缺少 "=" 赋值符号`,
        node.key.loc ?? this.tokenizer.emptyLoc(),
        node
      );
      this.handleOnlyKeyLoc(node);
      return node;
    }

    const valueToken = this.tokenizer.nextToken(); // 跳过等号
    // 换行，下面缩进代码应该是子块
    if (valueToken.type & TokenType.NewLine) {
      this.tokenizer.nextToken(); // 跳过换行符，下一个应该是缩进符
      node.value = this.parsePropertyInlineFragment();
      this.handleKeyValueLoc(node);
      return node;
    }

    if ((valueToken.type & ValueTokenType) === 0) {
      this.addError(
        ParseErrorCode.MISSING_PROP_ASSIGNMENT,
        `属性值不合法, "${valueToken.value}" 不合法`,
        valueToken.loc ?? this.tokenizer.emptyLoc(),
        node
      );

      this.handleOnlyKeyLoc(node);
      return node;
    }

    node.value = this.parsePropertyValue();
    this.tokenizer.nextToken();
    this.handleKeyValueLoc(node);
    return node;
  }

  handleOnlyKeyLoc(node: Property) {
    node.loc.start = node.key.loc.start;
    node.loc.end = node.key.loc.end;
    node.loc.source = this.tokenizer.code.slice(node.loc.start.offset, node.loc.end.offset);
  }

  handleKeyValueLoc(node: Property) {
    node.loc.start = node.key.loc.start;
    node.loc.end = node.value.loc.end;
    node.loc.source = this.tokenizer.code.slice(node.loc.start.offset, node.loc.end.offset);
  }

  /**
   * 根据值类型创建属性 key 节点
   */
  @NodeHook
  @TokenLoc
  parsePropertyKey(node?: PropertyKeyNode) {
    node.type = NodeType.PropertyKey;
    node.key = this.tokenizer.token.value as string;
    return node;
  }
  /**
   * 根据值类型创建属性值节点
   */
  @NodeHook
  @TokenLoc
  parseJsExp(node?: PropertyValue) {
    const [hookType, value] = this.tokenizer._hook({});
    node.type = hookType === 'dynamic' ? NodeType.DynamicValue : NodeType.StaticValue;
    node.value = value;
    return node;
  }
  /**
   * 根据值类型创建属性值节点
   */
  @NodeHook
  @TokenLoc
  parsePropertyValue(node?: PropertyValue) {
    const [hookType, value] = this.tokenizer._hook({});
    node.type = hookType === 'dynamic' ? NodeType.DynamicValue : NodeType.StaticValue;
    node.value = value;
    return node;
  }

  @NodeHook
  @NodeLoc
  parsePropertyInlineFragment(node?: PropertyValue) {
    const list = this.handleChildren();
    node.type = NodeType.StaticValue;
    node.value = list;
    return node;
  }

  /**
   * 根据值类型创建名称
   */
  @NodeHook
  @TokenLoc
  parseName(node?: PropertyValue) {
    const [hookType, value] = this.tokenizer._hook({});
    node.type = hookType === 'dynamic' ? NodeType.DynamicValue : NodeType.StaticValue;
    node.value = value;
    return node;
  }
}

function NodeLoc(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    _node.loc.start = this.tokenizer.token.loc.start;
    const result = target.call(this, _node);
    _node.loc.end = this.tokenizer.token.loc ? this.tokenizer.token.loc.start : this.tokenizer.getCurrentPos();
    _node.loc.source = this.tokenizer.code.slice(_node.loc.start.offset, _node.loc.end.offset);
    return result;
  };
}
function TokenLoc(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    const result = target.call(this, _node);
    _node.loc = this.tokenizer.token.loc;
    return result;
  };
}

function NodeHook(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    const hook = this.hooks[context.name as keyof typeof this.hooks];
    const node = { loc: {} } as BaseNode;
    hook?.enter?.call(this, node);
    const result = target.call(this, node);
    hook?.leave?.call(this, node);
    return result;
  };
}

type PickParseProps<T> = {
  [K in keyof T as K extends `parse${string}` ? K : never]: T[K];
};

type ParseProps = PickParseProps<Compiler>;

type ParseHooks = Partial<{
  [K in keyof ParseProps]: {
    enter?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
    leave?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
    propsAdded?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
  };
}>;
