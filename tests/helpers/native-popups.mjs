import ts from 'typescript';
export function nativePopups(source, filename='source.tsx') {
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const forbidden=new Set(['alert','confirm','prompt']),globals=new Set(['window','globalThis','self']),aliases=new Set(),findings=[];
  const globalObject=node=>ts.isIdentifier(node)&&globals.has(node.text);
  const nativeReference=node=>(ts.isPropertyAccessExpression(node)&&globalObject(node.expression)&&forbidden.has(node.name.text))||(ts.isElementAccessExpression(node)&&globalObject(node.expression)&&ts.isStringLiteral(node.argumentExpression)&&forbidden.has(node.argumentExpression.text));
  function walk(node) {
    if(nativeReference(node))findings.push({line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,text:node.getText(ast)});
    if(ts.isVariableDeclaration(node)&&node.initializer){
      if(ts.isIdentifier(node.name)&&nativeReference(node.initializer))aliases.add(node.name.text);
      if(ts.isObjectBindingPattern(node.name)&&globalObject(node.initializer))for(const binding of node.name.elements){if(forbidden.has((binding.propertyName||binding.name).getText(ast))){aliases.add(binding.name.getText(ast));findings.push({line:ast.getLineAndCharacterOfPosition(binding.getStart(ast)).line+1,text:binding.getText(ast)});}}
    }
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&(forbidden.has(node.expression.text)||aliases.has(node.expression.text)))findings.push({line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,text:node.expression.text});
    ts.forEachChild(node,walk);
  }walk(ast);return findings;
}
