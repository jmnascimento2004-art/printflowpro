import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const loadDiscardResolver = async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  const source = page.match(/function resolveDiscardedWhatsAppDraft[\s\S]+?(?=\nconst CUSTOM_PREVIEW_VALUES)/)?.[0];
  assert.ok(source, 'resolveDiscardedWhatsAppDraft must remain executable by the UI');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const resolveDiscardedWhatsAppDraft = Function(`${output}; return resolveDiscardedWhatsAppDraft;`)();
  return { page, resolveDiscardedWhatsAppDraft };
};

const loadRecipientFlow = async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  const recipientSource = page.match(/const selectedTestCustomer = customers\.find[\s\S]+?(?=\n\n  useEffect)/)?.[0];
  const openTestSource = page.match(/const openTest = \(\) => \{[\s\S]+?\n  \};/)?.[0];
  assert.ok(recipientSource, 'the UI recipient resolution must remain executable by this regression test');
  assert.ok(openTestSource, 'the real Testar mensagem action must remain executable by this regression test');

  const recipientOutput = ts.transpileModule(`
    function resolveRecipientFlow(args) {
      const { customers, testCustomerId, tab, customContext, customContent, customPreview, systemPreview, settings, testPhone } = args;
      ${recipientSource}
      return { selectedTestCustomer, customerRecipientPhone, customerRecipientError, testUrl };
    }
  `, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const resolveRecipientFlow = Function(
    'buildWhatsAppUrl',
    'renderWhatsAppCustomMessage',
    'customerPreviewValues',
    `${recipientOutput}; return resolveRecipientFlow;`
  )(
    (phone) => phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : '',
    (content, _context, values) => `${content}|${values['cliente.nome'] || ''}`,
    (customer) => ({ 'cliente.nome': customer?.name || '' })
  );

  const openTestOutput = ts.transpileModule(`
    function runOpenTest(args) {
      const { tab, customContext, testCustomerId, customers } = args;
      let opened = false;
      let selectedByHandler = null;
      const setTestOpen = (value) => { opened = value; };
      const setTestCustomerId = (value) => { selectedByHandler = value; };
      ${openTestSource}
      openTest();
      return { opened, selectedByHandler };
    }
  `, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const runOpenTest = Function(`${openTestOutput}; return runOpenTest;`)();
  return { page, resolveRecipientFlow, runOpenTest };
};

test('custom tab loads its tenant list once in parallel with the existing center', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /Promise\.all\(\[loadWhatsAppCenter\(company\.id\), listWhatsAppCustomMessages\(company\.id\)\]\)/);
  assert.equal((page.match(/listWhatsAppCustomMessages\(company\.id\)/g) || []).length, 1);
  assert.doesNotMatch(page, /customMessages\.(?:map|forEach)[\s\S]{0,300}listWhatsAppCustomMessages/);
});

test('tabs keep the exact approved order and the official workspace remains isolated', async () => {
  const [page, registry] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/lib/whatsapp/template-registry.ts')
  ]);
  const tabStart = page.indexOf('<div className="grid grid-cols-1');
  const tabs = page.slice(tabStart, tabStart + 1800);
  const systemIndex = tabs.indexOf('Mensagens do Sistema');
  const customIndex = tabs.indexOf('Mensagens Personalizadas');
  const settingsIndex = tabs.indexOf('Configurações');
  assert.ok(systemIndex >= 0 && systemIndex < customIndex && customIndex < settingsIndex);
  assert.equal((registry.match(/^\s+eventKey:/gm) || []).length, 4);
  assert.doesNotMatch(registry, /kind: 'custom'/);
});

test('list provides search, new action, empty state and an explicit empty CTA', async () => {
  const workspace = await read('../src/components/whatsapp/custom-message-workspace.tsx');
  assert.match(workspace, /Buscar mensagem personalizada/);
  assert.match(workspace, /Nenhuma mensagem encontrada/);
  assert.match(workspace, /Criar mensagem personalizada/);
  assert.match(workspace, /<Plus[\s\S]{0,100}Nova/);
});

test('editor validates duplicate names and delegates create, atomic update and delete to the existing service', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /validateWhatsAppCustomMessage/);
  assert.match(page, /toLocaleLowerCase\('pt-BR'\)[\s\S]{0,180}Já existe uma mensagem com esse nome/);
  assert.match(page, /createWhatsAppCustomMessage\(company\.id, input\)/);
  assert.match(page, /updateWhatsAppCustomMessage\(company\.id, selectedCustom\.id, \{ \.\.\.input, expectedUpdatedAt: selectedCustom\.updatedAt \}\)/);
  assert.match(page, /saveError\.code === 'CONFLICT'/);
  assert.match(page, /deleteWhatsAppCustomMessage\(company\.id, selectedCustom\.id\)/);
  assert.match(page, /Excluir mensagem personalizada\?/);
});

test('context allowlists, chips, cursor insertion and local safe preview are wired', async () => {
  const [page, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/custom-message-workspace.tsx')
  ]);
  assert.match(page, /getWhatsAppCustomVariables\(customContext\)/);
  assert.match(page, /selectionStart/);
  assert.match(page, /selectionEnd/);
  assert.match(page, /setSelectionRange/);
  assert.match(page, /renderWhatsAppCustomMessage\(customContent, customContext, CUSTOM_PREVIEW_VALUES\)/);
  assert.match(workspace, /allowedVariables\.map/);
  assert.match(workspace, /min-h-11[^"]*focus-visible:ring-2/);
});

test('customer test reuses the already loaded customer context and generic testing needs no customer', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /const \{ company, customers, quotes, orders, production, rolePermissions \} = useDatabase\(\)/);
  assert.match(page, /const customerRecipientRequired = tab === 'custom' && customContext === 'customer'/);
  assert.match(page, /showCustomer=\{customerRecipientRequired\}/);
  assert.match(page, /customerPreviewValues\(selectedTestCustomer\)/);
  assert.doesNotMatch(page, /from\(['"]customers['"]\)|select\([^)]*customers/);
});

test('customer testing requires a current selected customer with a valid recipient while generic remains independent', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /const selectedTestCustomer = customers\.find\(\(item\) => item\.id === testCustomerId\)/);
  assert.match(page, /const customerRecipientPhone = selectedTestCustomer[\s\S]{0,220}corporate_additional_info\?\.whatsapp \|\| selectedTestCustomer\.phone \|\| ''/);
  assert.match(page, /buildWhatsAppUrl\(customerRecipientPhone, testPreview, settings \|\| undefined\)/);
  assert.match(page, /!selectedTestCustomer[\s\S]{0,100}Selecione um cliente para testar esta mensagem/);
  assert.match(page, /!customerRecipientUrl[\s\S]{0,120}não possui um telefone ou WhatsApp válido/);
  assert.match(page, /customerRecipientRequired[\s\S]{0,180}customerRecipientError \? '' : customerRecipientUrl[\s\S]{0,140}buildWhatsAppUrl\(testPhone/);
  assert.match(page, /const canOpen = Boolean\(url\) && !recipientError/);
  assert.match(page, /href=\{canOpen \? url : undefined\}/);
  assert.match(page, /if \(!canOpen\) event\.preventDefault\(\)/);
  assert.match(page, /readOnly=\{showCustomer\}/);
  assert.match(page, /setTestCustomerId\(''\)/);
  assert.doesNotMatch(page, /onCustomerChange=\{\(id\) =>[\s\S]{0,180}setTestPhone/);
});

test('real customer test flow requires explicit selection and never falls back to the first loaded customer', async () => {
  const { page, resolveRecipientFlow, runOpenTest } = await loadRecipientFlow();
  const customerA = {
    id: 'customer-a',
    name: 'Cliente A',
    phone: '5511999991111',
    corporate_additional_info: { whatsapp: '5511888881111' }
  };
  const customerB = {
    id: 'customer-b',
    name: 'Cliente B',
    phone: '5522999992222',
    corporate_additional_info: { whatsapp: '5522888882222' }
  };
  const base = {
    customers: [customerA, customerB],
    tab: 'custom',
    customContext: 'customer',
    customContent: 'Olá {{cliente.nome}}',
    customPreview: '',
    systemPreview: '',
    settings: {},
    testPhone: '5533999993333'
  };

  const noSelection = resolveRecipientFlow({ ...base, testCustomerId: '' });
  const openWithoutSelection = runOpenTest({ ...base, testCustomerId: '' });
  assert.equal(noSelection.selectedTestCustomer, undefined);
  assert.equal(noSelection.customerRecipientPhone, '');
  assert.equal(noSelection.testUrl, '');
  assert.match(noSelection.customerRecipientError, /Selecione um cliente/);
  assert.deepEqual(openWithoutSelection, { opened: true, selectedByHandler: null });
  assert.match(page, /href=\{canOpen \? url : undefined\}/);
  assert.match(page, /if \(!canOpen\) event\.preventDefault\(\)/);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);

  const explicitB = resolveRecipientFlow({ ...base, testCustomerId: customerB.id });
  assert.equal(explicitB.selectedTestCustomer.id, customerB.id);
  assert.equal(explicitB.customerRecipientPhone, customerB.corporate_additional_info.whatsapp);
  assert.match(explicitB.testUrl, /5522888882222/);
  assert.doesNotMatch(explicitB.testUrl, /5511888881111/);
  assert.equal(explicitB.customerRecipientError, null);

  const invalidB = resolveRecipientFlow({
    ...base,
    customers: [customerA, { ...customerB, phone: '', corporate_additional_info: { whatsapp: '' } }],
    testCustomerId: customerB.id
  });
  assert.equal(invalidB.testUrl, '');
  assert.match(invalidB.customerRecipientError, /telefone ou WhatsApp válido/);

  const generic = resolveRecipientFlow({ ...base, customContext: 'generic', testCustomerId: '' });
  assert.equal(generic.customerRecipientError, null);
  assert.match(generic.testUrl, /5533999993333/);
});

test('permission mirror exposes read-only custom UI without bypassing RLS', async () => {
  const [page, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/custom-message-workspace.tsx')
  ]);
  assert.match(page, /activeProfile\.role === 'admin'/);
  assert.match(page, /activeProfile\.role === 'gerente'[\s\S]{0,100}allowedWhatsAppRoles\.includes\('gerente'\)/);
  assert.match(workspace, /Modo somente leitura/);
  assert.match(workspace, /disabled=\{!canMutate\}/);
  assert.doesNotMatch(page + workspace, /service_role|SUPABASE_SERVICE_ROLE/i);
});

test('dirty state guards selection, new message, tabs and page exit, then clears after mutations or discard', async () => {
  const page = await read('../src/app/(dashboard)/whatsapp/page.tsx');
  assert.match(page, /if \(dirty\) setPendingNavigation\(next\)/);
  assert.match(page, /kind: 'custom'/);
  assert.match(page, /kind: 'new-custom'/);
  assert.match(page, /kind: 'tab'/);
  assert.match(page, /kind: 'route'/);
  assert.match(page, /addEventListener\('beforeunload', confirmExit\)/);
  assert.match(page, /document\.addEventListener\('click', guardInternalNavigation, true\)/);
  assert.match(page, /router\.push\(next\.value\)/);
  assert.match(page, /Descartar alterações\?/);
  assert.ok((page.match(/setDirty\(false\)/g) || []).length >= 6);
});

test('discarding an edited existing message restores its persisted visible draft and clean state', async () => {
  const { page, resolveDiscardedWhatsAppDraft } = await loadDiscardResolver();
  const persisted = { id: 'custom-a', name: 'Persisted name', content: 'Persisted content', contextType: 'customer' };
  const unsavedDraft = { name: 'Unsaved name', content: 'Unsaved content', contextType: 'generic', dirty: true };
  const restored = resolveDiscardedWhatsAppDraft({
    tab: 'custom', systemContent: '', systemActive: true, customMessage: persisted, persistedSettings: null
  });

  assert.notEqual(unsavedDraft.content, restored.content);
  assert.deepEqual(restored, {
    kind: 'custom', name: persisted.name, content: persisted.content, contextType: persisted.contextType, creating: false, dirty: false
  });
  assert.match(page, /setCustomName\(restored\.name\)[\s\S]{0,180}setCustomContent\(restored\.content\)[\s\S]{0,180}setCustomContext\(restored\.contextType\)/);
  assert.match(page, /setDirty\(restored\.dirty\)/);
});

test('discard before switching from custom A to B removes A unsaved values before selection changes', async () => {
  const { page, resolveDiscardedWhatsAppDraft } = await loadDiscardResolver();
  const persistedA = { id: 'custom-a', name: 'A saved', content: 'A saved content', contextType: 'generic' };
  const persistedB = { id: 'custom-b', name: 'B saved', content: 'B saved content', contextType: 'customer' };
  const restoredA = resolveDiscardedWhatsAppDraft({
    tab: 'custom', systemContent: '', systemActive: true, customMessage: persistedA, persistedSettings: null
  });
  const restoredAfterReturn = resolveDiscardedWhatsAppDraft({
    tab: 'custom', systemContent: '', systemActive: true, customMessage: persistedA, persistedSettings: null
  });

  assert.equal(restoredA.content, 'A saved content');
  assert.equal(persistedB.content, 'B saved content');
  assert.equal(restoredAfterReturn.content, 'A saved content');
  assert.doesNotMatch(restoredAfterReturn.content, /unsaved/i);
  assert.ok(page.indexOf('if (discard) restoreCurrentDraft()') < page.indexOf("if (next.kind === 'custom')"));
  assert.match(page, /setSelectedCustomId\(next\.value\)/);
});

test('discard on tab switch restores custom, system and settings persisted snapshots', async () => {
  const { page, resolveDiscardedWhatsAppDraft } = await loadDiscardResolver();
  const custom = resolveDiscardedWhatsAppDraft({
    tab: 'custom',
    systemContent: 'System saved',
    systemActive: true,
    customMessage: { id: 'custom-a', name: 'Custom saved', content: 'Custom saved content', contextType: 'generic' },
    persistedSettings: null
  });
  const system = resolveDiscardedWhatsAppDraft({
    tab: 'templates', systemContent: 'System saved', systemActive: false, persistedSettings: null
  });
  const persistedSettings = { business_phone: '5551999999999', signature: 'Saved signature' };
  const settings = resolveDiscardedWhatsAppDraft({
    tab: 'settings', systemContent: '', systemActive: true, persistedSettings
  });

  assert.equal(custom.content, 'Custom saved content');
  assert.deepEqual(system, { kind: 'templates', content: 'System saved', active: false, dirty: false });
  assert.equal(settings.settings, persistedSettings);
  assert.equal(settings.dirty, false);
  assert.match(page, /onConfirm=\{\(\) => applyNavigation\(pendingNavigation, true\)\}/);
  assert.ok(page.indexOf('if (discard) restoreCurrentDraft()') < page.indexOf("if (next.kind === 'tab')"));
});

test('discarding a new unsaved message clears its hidden draft before any later creation', async () => {
  const { page, resolveDiscardedWhatsAppDraft } = await loadDiscardResolver();
  const unsavedNew = { name: 'Never persisted', content: 'Must disappear', contextType: 'customer', dirty: true };
  const restored = resolveDiscardedWhatsAppDraft({
    tab: 'custom', systemContent: '', systemActive: true, customMessage: undefined, persistedSettings: null
  });

  assert.notEqual(unsavedNew.content, restored.content);
  assert.deepEqual(restored, {
    kind: 'custom', name: '', content: '', contextType: 'generic', creating: false, dirty: false
  });
  assert.match(page, /setCustomCreating\(restored\.creating\)/);
  assert.match(page, /if \(next\.kind === 'new-custom'\)[\s\S]{0,220}setCustomName\(''\)[\s\S]{0,120}setCustomContent\(''\)[\s\S]{0,120}setCustomContext\('generic'\)/);
});

test('save success advances the persisted snapshot while failure and conflict leave it unchanged', async () => {
  const { page, resolveDiscardedWhatsAppDraft } = await loadDiscardResolver();
  const latestSaved = { id: 'custom-a', name: 'P1 saved', content: 'P1 saved content', contextType: 'customer' };
  const restoredAfterP2 = resolveDiscardedWhatsAppDraft({
    tab: 'custom', systemContent: '', systemActive: true, customMessage: latestSaved, persistedSettings: null
  });
  const saveHandler = page.match(/const handleSaveCustom =[\s\S]+?(?=\n  const handleDeleteCustom)/)?.[0] || '';
  const settingsHandler = page.match(/const handleSaveSettings =[\s\S]+?(?=\n  const openTest)/)?.[0] || '';

  assert.equal(restoredAfterP2.content, 'P1 saved content');
  assert.equal(restoredAfterP2.dirty, false);
  assert.match(saveHandler, /setCustomMessages[\s\S]+setCustomContent\(saved\.content\)[\s\S]+setDirty\(false\)/);
  assert.match(saveHandler, /saveError\.code === 'CONFLICT'[\s\S]+setError/);
  assert.doesNotMatch(saveHandler.match(/catch \(saveError\)[\s\S]+?(?=\n    } finally)/)?.[0] || '', /setCustomMessages|setDirty\(false\)/);
  assert.match(settingsHandler, /setSettings\(saved\)[\s\S]+setPersistedSettings\(saved\)[\s\S]+setDirty\(false\)/);
  assert.doesNotMatch(settingsHandler.match(/catch \(saveError\)[\s\S]+?(?=\n    } finally)/)?.[0] || '', /setPersistedSettings/);
});

test('custom desktop workspace has three panels and mobile guards horizontal overflow', async () => {
  const [page, layout, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/app/(dashboard)/layout.tsx'),
    read('../src/components/whatsapp/custom-message-workspace.tsx')
  ]);
  assert.equal((page.match(/xl:grid-cols-\[270px_minmax\(0,1fr\)_320px\]/g) || []).length, 1);
  assert.match(page, /xl:grid-cols-\[270px_minmax\(0,1fr\)\]/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  assert.match(page, /min-w-0 space-y-5/);
  assert.match(layout, /overflow-x-hidden/);
  assert.match(workspace, /min-w-0/);
});
