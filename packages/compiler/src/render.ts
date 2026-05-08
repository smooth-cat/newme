import { Store } from 'aoye';
import { Interpreter } from './terp';
import { Tokenizer } from './tokenizer';
import { UI, ComponentNode, CustomRenderConf, FakeType } from './type';

export function bobe<T extends Record<any, any> = any>(fragments: TemplateStringsArray, ...values: any[]) {
  const ui: UI<T> = function ui(isSub: boolean) {
    const tokenizer = new Tokenizer(({ i }) => {
      return values[i];
    }, isSub);
    tokenizer.init(Array.from(fragments));
    return tokenizer;
  };
  ui.boundStore = Store.Current as any;
  return ui;
}

// render -> options
export function customRender(option: CustomRenderConf) {
  // 保存 options
  return function render<T>(Ctor: typeof Store, root: any) {
    const store = Ctor.new();
    // @ts-ignore
    const tokenizer: Tokenizer = store.ui(false);
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
