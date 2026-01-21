import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
// import myCustomTransform from './rollup-tranform-class';
import RollupTypescript from 'rollup-plugin-typescript2';
import pkg from './package.json';
import NodePath from 'path';
import { babel } from '@rollup/plugin-babel';
// console.log('myCustomTransform', myCustomTransform);

const resolveFile = path => NodePath.resolve(__dirname, path);
const bigCamel = name =>
  name
    .split('-')
    .map(it => it[0].toUpperCase() + it.slice(1))
    .join('');

export default [
  // browser-friendly UMD build
  {
    input: 'src/index.ts',
    output: {
      file: pkg.browser,
      name: bigCamel(pkg.name),
      format: 'umd'
    },
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      RollupTypescript({
        tsconfig: resolveFile('tsconfig.rollup.json')
      })
    ]
  },
  // CommonJS (for Node) and ES module (for bundlers) build.
  // (We could have three entries in the configuration array
  // instead of two, but it's quicker to generate multiple
  // builds from a single configuration where possible, using
  // an array for the `output` option, where we can specify
  // `file` and `format` for each target)
  {
    input: 'src/index.ts',
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' }
    ],
    plugins: [
      RollupTypescript({
        tsconfig: resolveFile('tsconfig.rollup.json')
      }),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.ts'],
        plugins: [resolveFile('rollup-tranform-class.js')] // 使用我们刚才写的插件
      })
    ]
  }
];
