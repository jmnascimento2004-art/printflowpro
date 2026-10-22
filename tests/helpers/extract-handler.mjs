import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
export async function extractHandler(path,name,dependencies){
 const source=await readFile(path,'utf8'),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
 function walk(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)declaration=node;ts.forEachChild(node,walk);}walk(ast);assert.ok(declaration,name);
 const code=ts.transpileModule(`const ${declaration.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return Function(...Object.keys(dependencies),`${code};return ${name};`)(...Object.values(dependencies));
}
