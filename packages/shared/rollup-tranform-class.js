/** @typedef {import('@babel/core')} babel */
/** @typedef {import('@babel/types')} t */

/**
 * @param {babel} babel
 * @returns {babel.PluginObj}
 */

export default function ({ types: t }) {
  return {
    visitor: {
      Program: {
        enter: (path, state) => {
          const fullCode = path.hub.file.code;
          // console.log('代码', fullCode);
          state.staticFns = [];
        },
        exit: (path, state) => {
          // console.log('收集到的静态方法', state.staticFns.length);
          path.unshiftContainer('body', state.staticFns);
        }
      },
      ClassDeclaration: {
        enter: (path, state) => {
          state.values = [];
          const className = path.node.id?.name || '__default';
          state.className = className;
          state.genFns = [];
          state.getSets = [];
          state.exportState = path.parentPath.isExportDefaultDeclaration()
            ? 'default'
            : path.parentPath.isExportNamedDeclaration()
              ? 'name'
              : '';
        },
        exit: (path, state) => {
          const { params, values, className, exportState } = state;
          // 防止同一个 Class 后面重复插入（如果插件运行多次）
          if (path.getData('wuhuInserted')) return;
          console.log(`正在类 ${className} 后插入函数`);

          // if (path.parentPath.isExportDefaultDeclaration()) {
          //   // 特殊处理 export default class
          //   path.replaceWith(t.functionExpression(id, [], t.blockStatement([])));
          // } else {
          //   path.replaceWith(funcDec);
          // }
          const fnCreator = exportState === 'default' ? 'functionExpression' : 'functionDeclaration';

          // 1. 构建 wuhu 函数
          const replaceFn = t[fnCreator](
            path.node.id,
            // t.identifier(className + '1'),
            (params || []).map(param => t.cloneNode(param)),
            t.blockStatement([
              t.returnStatement(
                t.objectExpression([
                  ...values.map(({ name, right }) => {
                    return t.objectProperty(t.identifier(name), t.cloneNode(right, true));
                  }),
                  ...state.genFns.map(funcDec => {
                    let name = funcDec.id.name || '';
                    name = name.split('_$$$_').pop();
                    const propId = t.identifier(name);
                    return t.objectProperty(propId, funcDec.id);
                  }),
                  ...state.getSets
                ])
              )
            ])
          );

          // 没有导出 直接在类后面插入
          if (exportState === '') {
            path.insertAfter(state.genFns);
          }
          // 有导出 在 导出后面插入
          else {
            path.parentPath.insertAfter(state.genFns);
          }

          // 函数替换本节点
          path.replaceWith(replaceFn);
          // const fns = [t.exportNamedDeclaration(replaceFn), ...state.genFns];

          // // 2. 在当前 Class 节点之后插入
          // // 如果你的 Class 是 export 的，我们需要处理 export 包装
          // if (path.parentPath.isExportNamedDeclaration()) {
          //   console.log('isExport');
          //   path.parentPath.insertAfter(fns);
          // } else {
          //   path.insertAfter(fns);
          // }

          // 标记已插入，避免重入
          path.setData('wuhuInserted', true);
        }
      },
      ClassMethod(path, state) {
        if (path.node.kind === 'constructor') {
          const body = path.node.body.body;
          state.params = path.node.params;
          for (let i = 0; i < body.length; i++) {
            const { left, right } = body[i].expression;
            const name = left.property.name;
            const item = {
              name,
              right
            };
            state.values.push(item);
          }
        } else if (path.node.kind === 'method') {
          const className = state.className;
          // 1. 提取必要信息：名称、参数、函数体
          const { key, params, body, generator, async } = path.node;

          // 2. 只有当 key 是 Identifier 时才转换（处理普通方法名）
          const functionName = key.name;

          const fnId = t.identifier(`${className}_$$$_${functionName}`);
          // 3. 创建 FunctionDeclaration
          const funcDec = t.functionDeclaration(fnId, params, body, generator, async);

          if (path.node.static) {

            const left = t.memberExpression(t.identifier(className), t.identifier(functionName));

            // 2. 构造右侧：C (Identifier)
            const right = fnId;

            // 3. 构造赋值表达式：A.b = C
            const assignment = t.assignmentExpression('=', left, right);

            // 4. 将表达式包装成语句（Statement）
            const assign = t.expressionStatement(assignment);
            
            state.staticFns.push(funcDec, assign);
          } else {
            state.genFns.push(funcDec);
          }
        } else if (path.node.kind === 'get' || path.node.kind === 'set') {
          const { key, body, computed, params } = path.node;

          // 创建对象方法节点
          const objectGetMethod = t.objectMethod(
            path.node.kind, // kind
            key, // 属性名
            params, // getter 没有参数
            body, // 函数体
            computed // 是否是计算属性，如 get [prop]() {}
          );
          state.getSets.push(objectGetMethod);
        }
      },
      ClassProperty(path, state) {
        const stat = path.node.static;
      },
      NewExpression(path, state) {
        const binding = path.scope.getBinding(path.node.callee.name);
        switch (binding) {
          case undefined:
            break;
          case 'import':
          case 'class':
          default:
            path.replaceWith(t.callExpression(path.node.callee, path.node.arguments));
            break;
        }
      }
    }
  };
}
