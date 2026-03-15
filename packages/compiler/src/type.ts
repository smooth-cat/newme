import { Dispose, Signal, Store } from 'aoye';
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
  InsertionExp = 0b0000_0000_0000_0000_0000_0000_1000_0000
}

export enum FakeType {
  If = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  Fail = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  Else = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  For = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Component = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Fragment = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  ForItem = 0b0000_0000_0000_0000_0000_0000_0100_0000
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
  TokenizerSwitcher = 0b0000_0000_0000_0000_0000_0000_0001_0000
}

export enum TerpEvt {
  AllAttrGot = 'all-attr-got',
  HandledComponentNode = 'handled-component-node'
}

export type BaseType = string | number | boolean | undefined | null;

export const InsComputed = Symbol('insertion-computed-map-key');
export const IsAnchor = Symbol('is-anchor');

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

export type TerpConf = Partial<
  Pick<Interpreter, 'createNode' | 'setProp' | 'insertAfter' | 'remove' | 'createAnchor' | 'firstChild' | 'nextSib'>
>;
export type CustomRenderConf = Pick<
  TerpConf,
  'createNode' | 'setProp' | 'insertAfter' | 'remove' | 'createAnchor' | 'firstChild' | 'nextSib'
>;

export type Hook = (props: HookProps) => any;

export type HookType = 'dynamic' | 'static';

export type ProgramCtx = {
  stack: MultiTypeStack<any>;
  prevSibling: any;
  realParent: any;
  current: any;
  before: any;
};

/** 返回值是用户自定义的节点 */
export type BobeUI = {
  /** 在哪个 Store 声明的 */
  boundStore: Store;
  (isSub: boolean): Tokenizer;
};

export type StackItem = {
  /** 插入到 prev 后 */
  prev: any;
  /** 当前节点*/
  node: any;
};

export type LogicNode = {
  __logicType: FakeType;
  realParent: any;
  realBefore?: any;
  realAfter?: any;
  lastInserted?: any;
};

export type IfNode = LogicNode & {
  condition: Signal;
  isFirstRender: boolean;
  snapshot: ReturnType<Tokenizer['snapshot']>;
  effect: Dispose;
  preCond: IfNode | null;
  owner: ComponentNode | FragmentNode;
};

export type FragmentNode = LogicNode & {
  data: Store;
  tokenizer: Tokenizer;
};
export type ComponentNode = LogicNode & {
  data: Store;
  tokenizer: Tokenizer;
};
export type RootNode = LogicNode & {
  store: Store;
};
