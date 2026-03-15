import { Interpreter } from './terp';
import { Store } from 'aoye';
import { Tokenizer } from './tokenizer';
import { BobeUI, ComponentNode, CustomRenderConf, FakeType } from './type';
export * from 'aoye';
export function bobe(fragments: TemplateStringsArray, ...values: any[]) {
  const ui: BobeUI = function ui(isSub: boolean) {
    const tokenizer = new Tokenizer(({ i }) => {
      return values[i];
    }, isSub);
    tokenizer.init(Array.from(fragments));
    return tokenizer;
  };
  ui.boundStore = Store.Current;
  return ui;
}

// render -> options
export function customRender(option: CustomRenderConf) {
  // 保存 options
  return function render<T>(Ctor: typeof Store, root: any) {
    const store = Ctor.new();
    const tokenizer: Tokenizer = store['ui'](false);
    const terp = new Interpreter(tokenizer);
    terp.config(option);

    const componentNode: ComponentNode = {
      __logicType: FakeType.Component,
      realParent: root,
      data: store,
      tokenizer
    };

    terp.program(root, componentNode);
    // ui => bobe`` 返回的函数
    return [componentNode, store];
  };
}
