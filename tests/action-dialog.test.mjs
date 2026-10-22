import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionDialogController } from '../src/lib/action-dialog.mjs';

test('cancel never invokes an operation and resolves false', async () => {
  let calls = 0; let state;
  const dialog = createActionDialogController(value => { state = value; });
  const result = dialog.request({ title: 'Excluir' }, () => { calls++; });
  assert.equal(state.title, 'Excluir'); dialog.cancel();
  assert.equal(await result, false); assert.equal(calls, 0); assert.equal(state, null);
});
test('await persistence, block double submit/cancel, close only after success', async () => {
  let state, resolve; let calls = 0;
  const dialog = createActionDialogController(value => { state = value; });
  const result = dialog.request({}, () => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = dialog.confirm(); dialog.confirm(); dialog.cancel();
  assert.equal(calls, 1); assert.equal(state.busy, true);
  assert.equal(await dialog.request({}, () => assert.fail()), false);
  resolve(); await pending; assert.equal(await result, true); assert.equal(state, null);
});
test('failure remains open, suppresses raw exception and permits retry', async () => {
  let state; let calls = 0;
  const dialog = createActionDialogController(value => { state = value; });
  const result = dialog.request({ errorMessage: 'Não foi possível excluir.' }, () => { if (++calls === 1) throw new Error('SQL secret'); });
  await dialog.confirm(); assert.equal(state.busy, false); assert.equal(state.error, 'Não foi possível excluir.');
  await dialog.confirm(); assert.equal(await result, true);
});
test('false mutation result is a failure; controlled input reaches only confirmed action', async () => {
  let state, received;
  const dialog = createActionDialogController(value => { state = value; });
  const result = dialog.request({}, value => { received = value; return false; });
  await dialog.confirm('https://example.test'); assert.equal(received, 'https://example.test'); assert.ok(state.error);
  dialog.cancel(); assert.equal(await result, false);
});
