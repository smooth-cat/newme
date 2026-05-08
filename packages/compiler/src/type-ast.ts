import { SourceLocation } from "./type";

// NodeType包含所有节点类型，包括属性、值等
enum NodeType {
  // 真实节点类型
  Element = 'Element', // 真实DOM节点
  Text = 'Text', // 文本节点
  Interpolation = 'Interpolation', // 插值节点
  Comment = 'Comment', // 注释节点

  // 属性相关类型
  Property = 'Property', // 属性节点
  PropertyKey = 'PropertyKey', // 属性节点
  StaticValue = 'StaticValue', // 静态值
  DynamicValue = 'DynamicValue', // 动态值（JS表达式）

  // 程序入口
  Program = 'Program', // 程序根节点

  // 逻辑节点类型
  If='If',
  Else='Else',
  Fail='Fail',
  For='For',
  Component='Component',
  Fragment='Fragment'
}

// 扩展类型联合，包括FakeType和NodeType
type ASTNodeType =  NodeType;

// 基础节点接口
interface BaseNode {
  type: ASTNodeType; // 直接使用FakeType或NodeType作为类型
  loc?: SourceLocation;
  hasError?: boolean;
}



// 程序根节点
interface Program extends BaseNode {
  type: NodeType.Program;
  body: TemplateNode[];
}

// 模板节点类型
type TemplateNode =
  | ElementNode // 真实DOM元素节点
  | TextNode // 文本节点
  | InterpolationNode // 插值节点
  | ConditionalNode // 条件节点（复用NodeType.If）
  | LoopNode // 循环节点（复用NodeType.For）
  | ComponentNode // 组件节点（复用NodeType.Component）
  | FragmentNode // 片段节点（复用NodeType.Fragment）
  | CommentNode;

// 真实DOM元素节点（使用NodeType.Element）
interface ElementNode extends BaseNode {
  type: NodeType.Element;
  tagName: string;
  props: Property[];
  children: TemplateNode[];
}

interface CommentNode extends BaseNode {
  type: NodeType.Comment;
  value: string;
}

// 文本节点（使用NodeType.Text）
interface TextNode extends BaseNode {
  type: NodeType.Text;
  value: string;
}

// 插值节点（使用NodeType.Interpolation）
interface InterpolationNode extends BaseNode {
  type: NodeType.Interpolation;
  expression: string;
}

// 属性节点（使用NodeType.Property）
interface Property extends BaseNode {
  type: NodeType.Property;
  key: PropertyKeyNode;
  value?: PropertyValue;
}

// 属性值类型 - 区分静态和动态
type PropertyValue = StaticValue | DynamicValue;

// 静态值（使用NodeType.StaticValue）
interface StaticValue extends BaseNode {
  type: NodeType.StaticValue;
  value: string | number | boolean | TemplateNode[];
}

// 动态值（JS表达式）（使用NodeType.DynamicValue）
interface PropertyKeyNode extends BaseNode {
  type: NodeType.PropertyKey;
  key: string;
}
// 动态值（JS表达式）（使用NodeType.DynamicValue）
interface DynamicValue extends BaseNode {
  type: NodeType.DynamicValue;
  value: string;
}

// 条件节点（复用NodeType.If）
interface ConditionalNode extends BaseNode {
  type: NodeType.If | NodeType.Else | NodeType.Fail;
  condition: PropertyValue;
  consequent: TemplateNode[];
  children?: TemplateNode[];
}

// 循环节点（复用NodeType.For）
interface LoopNode extends BaseNode {
  type: NodeType.For;
  collection: PropertyValue; // 被迭代的集合
  item: PropertyValue; // 项变量名
  index?: PropertyValue; // 索引变量名
  key?: PropertyValue; // 键名
  children: TemplateNode[]; // 循环体
}

// 组件节点（复用NodeType.Component）
interface ComponentNode extends BaseNode {
  type: NodeType.Component;
  componentName: PropertyValue; // 组件名称
  props: Property[]; // 组件属性
  children?: TemplateNode[]; // 组件插槽内容
}

// 片段节点（复用NodeType.Fragment）
interface FragmentNode extends BaseNode {
  type: NodeType.Fragment;
  nodes: TemplateNode[];
}

// 导出所有类型
export {
  NodeType,
  ASTNodeType,
  BaseNode,
  Program,
  TemplateNode,
  ElementNode,
  TextNode,
  InterpolationNode,
  Property,
  PropertyValue,
  StaticValue,
  PropertyKeyNode,
  DynamicValue,
  ConditionalNode,
  LoopNode,
  ComponentNode,
  FragmentNode,
  CommentNode
};
