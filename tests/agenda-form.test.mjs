import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function compile(file, deps = {}) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', code)(module.exports, module, name => deps[name] || require(name));
  return module.exports;
}
const agenda = await compile('../src/lib/agenda.ts');
function hooks() {
  let index = 0;
  const slots = [], effects = [];
  return { slots, effects, reset() { index = 0; }, react: {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
    useEffect(effect) { effects[0] = effect; }, useId() { return 'customer-test'; },
  } };
}
function all(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(all);
  return [node, ...all(node.props?.children)];
}
function find(tree, predicate) { const result = all(tree).find(predicate); assert.ok(result, 'Expected control'); return result; }
const byName = (tree, name) => find(tree, node => node.props?.name === name);
const button = (tree, text) => find(tree, node => node.type === 'button' && node.props.children === text);
async function formHarness(t, event) {
  const h = hooks(); let closed = 0, saved = 0;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
  const oldDocument = globalThis.document, oldFormData = globalThis.FormData;
  globalThis.document = { body: {} };
  globalThis.FormData = class { constructor(fields) { this.fields = fields; } get(name) { return this.fields[name] ?? null; } };
  t.after(() => { globalThis.document = oldDocument; globalThis.FormData = oldFormData; });
  const { EventForm } = await compile('../src/components/agenda/event-form.tsx', {
    react: h.react, 'react-dom': { createPortal: node => node },
    '@/context/auth-context': { useAuth: () => ({ session: { access_token: 'test' }, activeProfile: { id: 'p1' } }) },
    '@/lib/agenda': agenda, './use-agenda': { useAgenda: () => ({ data: { profiles: [{ id: 'p1', name: 'Responsável' }], customers: [] } }) },
    './customer-picker': { CustomerPicker: 'customer-picker' },
  });
  const render = () => { h.reset(); return EventForm({ event, date: '2026-10-21', onClose: () => closed++, onSaved: () => saved++ }); };
  const fields = { title: 'Visita', date: '2026-10-21', time: '09:00', end: '10:00', end_date: '2026-10-21', responsible: 'p1', customer: 'c1', status: 'agendado', reminder: '30', event_type: 'visita', description: 'Observação' };
  return { h, render, fields, closed: () => closed, saved: () => saved, submit: tree => find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: fields }) };
}
test('new form keeps canonical status, dates, responsible and reminder options', async t => {
  const h = await formHarness(t); const tree = h.render();
  assert.equal(tree.type, 'dialog'); assert.equal(tree.props['aria-modal'], 'true');
  assert.equal(byName(tree, 'status').props.type, 'hidden'); assert.equal(byName(tree, 'status').props.value, 'agendado');
  assert.equal(byName(tree, 'date').props.defaultValue, '2026-10-21');
  assert.equal(byName(tree, 'end_date').props.defaultValue, '2026-10-21');
  assert.equal(byName(tree, 'responsible').props.value, 'p1');
  assert.deepEqual(all(byName(tree, 'reminder')).filter(n => n.type === 'option').map(n => n.props.value), ['', 0, 15, 30, 60, 1440, 10080]);
});
test('X, Cancel and safe Escape close through the parent callback', async t => {
  const h = await formHarness(t); const tree = h.render();
  find(tree, n => n.props?.['aria-label'] === 'Fechar compromisso').props.onClick();
  button(tree, 'Cancelar').props.onClick();
  let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(h.closed(), 3); assert.equal(prevented, true);
});
test('save awaits remote success, blocks duplicate submit and Escape while pending', async t => {
  const h = await formHarness(t); let resolve, calls = 0, payload;
  t.mock.method(globalThis, 'fetch', async (_url, request) => { calls++; payload = JSON.parse(request.body); return new Promise(r => { resolve = r; }); });
  const tree = h.render(); const pending = h.submit(tree); await h.submit(tree);
  assert.equal(calls, 1); assert.equal(h.saved(), 0);
  const busy = h.render(); assert.equal(find(busy, n => n.type === 'fieldset').props.disabled, true);
  busy.props.onCancel({ preventDefault() {} }); assert.equal(h.closed(), 0);
  assert.equal(payload.start_at, '2026-10-21T12:00:00.000Z'); assert.equal(payload.end_at, '2026-10-21T13:00:00.000Z');
  assert.equal(payload.customer_id, 'c1'); assert.equal(payload.responsible_profile_id, 'p1'); assert.equal(payload.reminder_minutes, 30);
  resolve({ ok: true, json: async () => ({}) }); await pending; assert.equal(h.saved(), 1);
});
test('remote error stays open, surfaces message and permits retry', async t => {
  const h = await formHarness(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => ({ error: 'Verifique o horário final.' }) }));
  await h.submit(h.render()); const tree = h.render();
  assert.equal(h.saved(), 0); assert.equal(h.closed(), 0);
  assert.equal(find(tree, n => n.props?.role === 'alert').props.children, 'Verifique o horário final.');
  assert.equal(find(tree, n => n.type === 'fieldset').props.disabled, false);
});
test('editing retains optimistic concurrency, links, recurrence and status', async t => {
  const event = { id: 'e1', updated_at: 'version', title: 'Visita', start_at: '2026-10-21T12:00:00Z', end_at: null, responsible_profile_id: 'p2', customer_id: 'c2', status: 'cancelado', recurrence: 'weekly', recurrence_until: '2026-11-21', reminder_minutes: 15 };
  const h = await formHarness(t, event); const tree = h.render();
  assert.equal(byName(tree, 'status').props.defaultValue, 'cancelado');
  assert.equal(byName(tree, 'responsible').props.value, 'p2');
  assert.equal(find(tree, n => n.type === 'customer-picker').props.value, 'c2');
  assert.equal(byName(tree, 'until').props.defaultValue, '2026-11-21');
  let payload; t.mock.method(globalThis, 'fetch', async (_url, request) => { payload = JSON.parse(request.body); return { ok: true, json: async () => ({}) }; });
  h.fields.until = '2026-11-21'; await h.submit(tree);
  assert.equal(payload.id, 'e1'); assert.equal(payload.updated_at, 'version'); assert.equal(payload.recurrence, 'weekly'); assert.equal(payload.recurrence_until, '2026-11-21');
});
test('modal lifecycle locks background scroll, focuses title and restores opener', async t => {
  const h = await formHarness(t); const tree = h.render();
  const oldHTMLElement = globalThis.HTMLElement; let titleFocused = false, returned = false, opened = false;
  globalThis.HTMLElement = class {};
  const opener = new globalThis.HTMLElement(); opener.isConnected = true; opener.focus = () => { returned = true; };
  const root = { style: { overflow: 'auto' } }, body = { style: { overflow: '' } }, main = { style: { overflow: 'scroll' } };
  Object.assign(globalThis.document, { activeElement: opener, documentElement: root, body, querySelectorAll: () => [main] });
  tree.props.ref.current = { showModal() { opened = true; }, close() { opened = false; }, querySelector: () => ({ focus() { titleFocused = true; } }) };
  t.after(() => { globalThis.HTMLElement = oldHTMLElement; });
  const cleanup = h.h.effects[0](); assert.equal(opened, true); assert.equal(titleFocused, true); assert.equal(main.style.overflow, 'hidden');
  cleanup(); assert.equal(opened, false); assert.equal(returned, true); assert.equal(root.style.overflow, 'auto'); assert.equal(body.style.overflow, ''); assert.equal(main.style.overflow, 'scroll');
});
test('searchable customer keeps canonical ID while typing, selects by keyboard and clears', async () => {
  const h = hooks(); const { CustomerPicker } = await compile('../src/components/agenda/customer-picker.tsx', { react: h.react });
  const props = { value: 'c1', onChange: value => { props.value = value; }, query: '', onQuery: value => { props.query = value; }, options: [{ id: 'c1', name: 'Ana' }, { id: 'c2', name: 'Bia' }], loading: false, inputClass: '' };
  const render = () => { h.reset(); return CustomerPicker(props); };
  const input = tree => find(tree, n => n.props?.role === 'combobox');
  input(render()).props.onFocus(); input(render()).props.onChange({ target: { value: 'Bia' } });
  assert.equal(byName(render(), 'customer').props.value, 'c1');
  props.options = [{ id: 'c2', name: 'Bia' }];
  input(render()).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  input(render()).props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.equal(props.value, 'c2'); assert.equal(input(render()).props.value, 'Bia');
  find(render(), n => n.props?.['aria-label'] === 'Remover cliente').props.onClick();
  assert.equal(props.value, ''); assert.equal(byName(render(), 'customer').props.value, '');
});
test('customer Escape closes suggestions without cancelling the dialog', async () => {
  const h = hooks(); const { CustomerPicker } = await compile('../src/components/agenda/customer-picker.tsx', { react: h.react });
  const render = () => { h.reset(); return CustomerPicker({ value: '', onChange() {}, query: '', onQuery() {}, options: [], loading: false, inputClass: '' }); };
  const input = tree => find(tree, n => n.props?.role === 'combobox');
  input(render()).props.onFocus(); let stopped = false;
  input(render()).props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true); assert.equal(input(render()).props['aria-expanded'], false);
});
test('keyboard navigation scrolls the active customer into view in a long list', async () => {
  const h = hooks(); const { CustomerPicker } = await compile('../src/components/agenda/customer-picker.tsx', { react: h.react });
  const props = { value: '', onChange() {}, query: '', onQuery() {}, options: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `Cliente ${i}` })), loading: false, inputClass: '' };
  const render = () => { h.reset(); return CustomerPicker(props); };
  const input = tree => find(tree, n => n.props?.role === 'combobox');
  input(render()).props.onFocus();
  for (let i = 0; i < 10; i++) input(render()).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  const tree = render(); let selector, scrolled;
  find(tree, n => n.props?.role === 'listbox').props.ref.current = { querySelector(value) { selector = value; return { scrollIntoView(options) { scrolled = options; } }; } };
  h.effects[0]();
  assert.equal(selector, '[data-index="9"]'); assert.deepEqual(scrolled, { block: 'nearest' });
  assert.equal(input(tree).props['aria-activedescendant'], 'customer-test-9');
});
