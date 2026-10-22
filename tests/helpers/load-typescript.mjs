import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import * as renderer from '@react-pdf/renderer';
import * as itemModel from '../../src/lib/pdf/pdf-item-view-model.mjs';
import * as metric from '../../src/lib/metric.mjs';
import * as deliveryTime from '../../src/lib/order-delivery-time.mjs';
import * as cellText from '../../src/lib/pdf/pdf-cell-text.mjs';
import * as access from '../../src/lib/pdf/pdf-access.mjs';
import * as productTable from '../../src/lib/pdf/pdf-product-table.mjs';

const root = resolve(import.meta.dirname, '../..');
const native = createRequire(import.meta.url);
const externals = { react: React, '@react-pdf/renderer': renderer };
const modules = new Map(Object.entries({
  'src/lib/pdf/pdf-item-view-model.mjs': itemModel, 'src/lib/metric.mjs': metric,
  'src/lib/order-delivery-time.mjs': deliveryTime, 'src/lib/pdf/pdf-cell-text.mjs': cellText,
  'src/lib/pdf/pdf-access.mjs': access, 'src/lib/pdf/pdf-product-table.mjs': productTable
}).map(([path, value]) => [resolve(root, path), value]));

export function loadTypescript(relative) {
  let path = resolve(root, relative);
  if (!extname(path)) {
    try { readFileSync(`${path}.ts`); path += '.ts'; } catch { path += '.tsx'; }
  }
  if (modules.has(path)) return modules.get(path);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  modules.set(path, module.exports);
  new Function('exports', 'module', 'require', code)(module.exports, module, key => {
    if (externals[key]) return externals[key];
    if (key.startsWith('@/')) return loadTypescript(`src/${key.slice(2)}`);
    if (key.startsWith('.')) return loadTypescript(resolve(dirname(path), key));
    return native(key);
  });
  return module.exports;
}
