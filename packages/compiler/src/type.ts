import { Computed, Dispose, Effect, Scope, Signal, SignalNode, Store } from 'aoye';
import type { Tokenizer } from './tokenizer';
import type { Interpreter } from './terp';
import { MultiTypeStack } from './typed';

export enum TokenType {
  NewLine = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  Indent = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  Dedent = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  Identifier = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Assign = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Pipe = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  Eof = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  InsertionExp = 0b0000_0000_0000_0000_0000_0000_1000_0000,
  Semicolon = 0b0000_0000_0000_0000_0000_0001_0000_0000,
  /** 仅编译时可解析 */
  StaticInsExp = 0b0000_0000_0000_0000_0000_0010_0000_0000,
  String = 0b0000_0000_0000_0000_0000_0100_0000_0000,
  Number = 0b0000_0000_0000_0000_0000_1000_0000_0000,
  Boolean = 0b0000_0000_0000_0000_0001_0000_0000_0000,
  Null = 0b0000_0000_0000_0000_0010_0000_0000_0000,
  Undefined = 0b0000_0000_0000_0000_0100_0000_0000_0000,
  Comment = 0b0000_0000_0000_0000_1000_0000_0000_0000
}

export const BaseTokenType =
  TokenType.String | TokenType.Number | TokenType.Boolean | TokenType.Null | TokenType.Undefined;
export const ValueTokenType = BaseTokenType | TokenType.InsertionExp | TokenType.StaticInsExp;

export enum FakeType {
  If = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  Fail = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  Else = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  For = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Component = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Fragment = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  ForItem = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  Context = 0b0000_0000_0000_0000_0000_0000_1000_0000
}

export const CondBit = FakeType.If | FakeType.Fail | FakeType.Else;
export const LogicalBit = FakeType.If | FakeType.Fail | FakeType.Else | FakeType.For | FakeType.ForItem;
export const CtxProviderBit =
  FakeType.If |
  FakeType.Fail |
  FakeType.Else |
  FakeType.For |
  FakeType.ForItem |
  FakeType.Component |
  FakeType.Fragment;

/** 条件节点、ForItem节点、Context节点  */
export const ContextBit = FakeType.If | FakeType.Fail | FakeType.Else | FakeType.ForItem | FakeType.Context;

export const TokenizerSwitcherBit = FakeType.Component | FakeType.Fragment;
export type NodeSortBit = number;
/**
 * 按不同维度分类，分类不互斥
 */
export enum NodeSort {
  /** 逻辑类型 1.if 2.else 3.fail 4.for 5. for item */
  Logic = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  /** 真实节点 */
  Real = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  /** 组件 */
  Component = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  /** FakeType 所有枚举都能提供 ctx，否则重新渲染时获取不到上下文 */
  CtxProvider = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  /** 节点可导致 token 切换 1. component 2. fragment */
  TokenizerSwitcher = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  /** context 关键字对应的节点 */
  Context = 0b0000_0000_0000_0000_0000_0000_0010_0000
}

export enum TerpEvt {
  AllAttrGot = 'all-attr-got',
  HandledComponentNode = 'handled-component-node'
}

export type BaseType = string | number | boolean | undefined | null;

export const InsComputed = Symbol('insertion-computed-map-key');
export const IsAnchor = Symbol('is-anchor');

export type SourceLocation = {
  start: Position;
  end: Position;
  source: string;
};

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export type Token = {
  type: TokenType;
  typeName: string;
  value: BaseType;
  loc: SourceLocation;
};

export type HookProps = {
  /** 通过哪个 HookId 进入的 */
  HookId: string;
  /**  第几个 hook */
  i: number;
  /** 父节点 */
  parentNode?: any;
};

export type TerpConf = Partial<
  Pick<Interpreter, 'createNode' | 'setProp' | 'insertAfter' | 'remove' | 'createAnchor' | 'firstChild' | 'nextSib'>
> & {
  noopEffect?: boolean;
};
export type CustomRenderConf = Pick<
  TerpConf,
  'createNode' | 'setProp' | 'insertAfter' | 'remove' | 'createAnchor' | 'firstChild' | 'nextSib'
>;

export type Hook = (props: HookProps) => any;

export type HookType = 'dynamic' | 'static';

export enum ParseErrorCode {
  UNCLOSED_BRACE = 9001,
  UNCLOSED_STRING,
  UNCLOSED_STATIC_INS,
  INCONSISTENT_INDENT,
  INDENT_MISMATCH,
  MISSING_ASSIGN,
  INVALID_TAG_NAME,
  INVALID_PROP_KEY,
  ELSE_WITHOUT_IF,
  EMPTY_IF_BODY,
  EMPTY_FOR_BODY,
  MISSING_FOR_COLLECTION,
  MISSING_FOR_SEMICOLON,
  MISSING_FOR_ITEM,
  MISSING_COMMENT_SECOND_SLASH,
  MISSING_PROP_ASSIGNMENT,
  PIPE_IN_WRONG_CONTEXT
}
export type ParseError = {
  code: ParseErrorCode;
  message: string;
  loc: SourceLocation;
};

/** tokenizer 抛出的带位置信息的语法错误 */
export class ParseSyntaxError extends SyntaxError {
  code: ParseErrorCode;
  loc: SourceLocation;
  constructor(code: ParseErrorCode, message: string, loc: SourceLocation) {
    super(message);
    this.code = code;
    this.loc = loc;
  }
}

export type ProgramCtx = {
  stack: MultiTypeStack<any>;
  prevSibling: any;
  realParent: any;
  current: any;
  before: any;
};

/** 返回值是用户自定义的节点 */
export type UI<T = any> = {
  /** 在哪个 Store 声明的 */
  boundStore: T;
  (isSub: boolean): Tokenizer;
};

export type StackItem = {
  /** 插入到 prev 后 */
  prev: any;
  /** 当前节点*/
  node: any;
};

export type LogicNode = {
  data: any;
  __logicType: FakeType;
  realParent: any;
  realBefore?: any;
  realAfter?: any;
};

export type ForNode = Omit<LogicNode, 'data'> & {
  children: ForItemNode[];
  snapshot: ReturnType<Tokenizer['snapshot']>;
  itemExp: string | ((value: any) => any);
  indexName?: string;
  getKey?: (data: any) => any;
  arr: any[];
  arrSignal: Signal<any[]> | Computed<any[]>;
  effect: Effect;
  i: number;
  owner: ComponentNode | FragmentNode;
  prevSibling: any;
  vars: string[];
};

export type ForItemNode = LogicNode & {
  id: number;
  forNode: ForNode;
  effect: Scope;
  key?: any;
  context: any;
};

export type IfNode = LogicNode & {
  condition: SignalNode;
  isFirstRender: boolean;
  snapshot: ReturnType<Tokenizer['snapshot']>;
  effect: Effect;
  preCond: IfNode | null;
  owner: ComponentNode | FragmentNode;
  context: any;
};

/** data 是 map<storeKey, store> */
export type ContextNode = Omit<LogicNode, 'data'> & {
  context: any;
};

export type FragmentNode = LogicNode & {
  tokenizer: Tokenizer;
};
export type ComponentNode = LogicNode & {
  tokenizer: Tokenizer;
  /** 模版片段快照 */
  fragmentSnapshot?: ReturnType<Tokenizer['snapshot']>;
  /** 渲染模版片段前的 快照，渲染完成后用于恢复 */
  resumeSnapshot?: ReturnType<Tokenizer['snapshot']>;
};
export type RootNode = LogicNode & {};

export type Dep = Signal | Computed | (() => any) | string;

export const isDep = (target: unknown): target is Dep =>
  target &&
  (target instanceof Signal ||
    target instanceof Computed ||
    typeof target === 'function' ||
    typeof target === 'string');
