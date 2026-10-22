import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir,readFile } from 'node:fs/promises';
import { nativePopups } from './helpers/native-popups.mjs';
import { feedbackMessage } from '../src/lib/feedback.mjs';
test('AST guard catches bare, qualified, computed and aliased native APIs',()=>{
  for(const source of ['alert("x")','confirm("x")','prompt("x")','window.alert("x")','window["confirm"]("x")','globalThis.prompt("x")','self.alert("x")','const ask=window.confirm;ask("x")','const {alert:warn}=window;warn("x")'])assert.ok(nativePopups(source).length,source);
  assert.deepEqual(nativePopups('controller.confirm(); deferredPrompt.prompt(); window.addEventListener("beforeunload", handler);'),[]);
});
test('application contains zero native alert/confirm/prompt UX, including aliases',async()=>{
  const found=[];let count=0;
  async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await scan(path);else if(/\.[cm]?[jt]sx?$/.test(path)){count++;for(const finding of nativePopups(await readFile(path,'utf8'),path))found.push({path,...finding});}}}
  await scan('src');assert.ok(count>100);assert.deepEqual(found,[]);
});
test('feedback preserves actionable copy but never backend diagnostics or tokens',()=>{
  for(const value of ['SQLSTATE 23505 duplicate key','Supabase: invalid token','PGRST301 forbidden','stack at save(file:1)','access_token=secret','eyJhbGciOiJIUzI1NiJ9.secret.signature'])assert.equal(feedbackMessage(value),'Não foi possível concluir a ação. Tente novamente.');
  assert.equal(feedbackMessage('Informe um preço maior que zero.'),'Informe um preço maior que zero.');
  assert.equal(feedbackMessage('Cliente salvo com sucesso.'),'Cliente salvo com sucesso.');
});
