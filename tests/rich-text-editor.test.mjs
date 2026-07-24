import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  captureEditorRange,
  normalizeRichTextHtml,
  normalizeRichTextUrl,
  rangeBelongsToEditor,
  rangeHasSelectedText,
  restoreEditorRange,
  sanitizeRichTextHtml,
  stripRichTextHtml
} from '../src/lib/rich-text-editor-core.mjs';

test('preserves semantic rich text while removing external presentation noise', () => {
  const input = '<h1>Título</h1><p class="MsoNormal" style="font-size: 18pt; text-align: center" onclick="alert(1)">Texto <strong>forte</strong></p><ul><li>Primeiro</li><li><em>Segundo</em></li></ul>';
  const result = sanitizeRichTextHtml(input);

  assert.equal(result, '<h1>Título</h1><p style="text-align: center">Texto <strong>forte</strong></p><ul><li>Primeiro</li><li><em>Segundo</em></li></ul>');
  assert.doesNotMatch(result, /MsoNormal|font-size|onclick/);
  assert.equal(stripRichTextHtml(result), 'Título Texto forte Primeiro Segundo');
});

test('keeps supported formatting, colors, lists and legacy headings', () => {
  const input = '<h2>Subtítulo</h2><h3>Legado</h3><ol><li><font color="#112233">Item</font></li></ol><span style="font-family: Arial; color: #445566; background-color: #ffeeaa">Final</span>';
  assert.equal(
    sanitizeRichTextHtml(input),
    '<h2>Subtítulo</h2><h3>Legado</h3><ol><li><span style="color: #112233">Item</span></li></ol><span style="color: #445566; background-color: #ffeeaa">Final</span>'
  );
});

test('removes executable markup, event handlers and unsafe CSS', () => {
  const input = '<script>alert(1)</script><iframe src="https://evil.example"></iframe><p onmouseover="steal()"><img src="data:image/png;base64,AAAA" onerror="steal()"><span style="position:fixed;color:expression(x);background:url(javascript:x)">Seguro</span></p>';
  const result = sanitizeRichTextHtml(input);

  assert.equal(result, '<p><span>Seguro</span></p>');
  assert.doesNotMatch(result, /script|iframe|onerror|onmouseover|javascript|expression|data:image/i);
});

test('accepts only approved link protocols and hardens external links', () => {
  assert.equal(normalizeRichTextUrl('example.com', { assumeHttps: true }), 'https://example.com');
  assert.equal(normalizeRichTextUrl('mailto:contato@example.com'), 'mailto:contato@example.com');
  assert.equal(normalizeRichTextUrl('tel:+5581999999999'), 'tel:+5581999999999');
  assert.equal(normalizeRichTextUrl('javascript:alert(1)'), '');
  assert.equal(normalizeRichTextUrl('data:text/html,evil'), '');

  assert.equal(
    sanitizeRichTextHtml('<a href="https://example.com">Site</a> <a href="javascript:alert(1)">Ataque</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Site</a> Ataque'
  );
});

test('escapes plain text and normalizes legacy encoded HTML without flattening blocks', () => {
  assert.equal(sanitizeRichTextHtml('Linha 1\nLinha <2>'), 'Linha 1<br />Linha &lt;2&gt;');
  assert.equal(
    normalizeRichTextHtml('&lt;h1&gt;Título&lt;/h1&gt;&lt;p&gt;Parágrafo&lt;/p&gt;'),
    '<h1>Título</h1><p>Parágrafo</p>'
  );
});

test('captures and restores only ranges that belong to the current editor', () => {
  const insideNode = { id: 'inside' };
  const outsideNode = { id: 'outside' };
  const editor = {
    contains: (node) => node === insideNode,
    focusCalls: 0,
    focus(options) {
      this.focusCalls += 1;
      this.focusOptions = options;
    }
  };
  const clonedRange = { commonAncestorContainer: insideNode, collapsed: false, toString: () => 'palavra' };
  const sourceRange = { ...clonedRange, cloneRange: () => clonedRange };
  const selection = {
    rangeCount: 1,
    removed: 0,
    added: [],
    getRangeAt: () => sourceRange,
    removeAllRanges() { this.removed += 1; },
    addRange(range) { this.added.push(range); }
  };

  assert.equal(rangeBelongsToEditor(editor, sourceRange), true);
  assert.equal(captureEditorRange(editor, selection), clonedRange);
  assert.equal(restoreEditorRange(editor, selection, clonedRange), true);
  assert.equal(editor.focusCalls, 1);
  assert.deepEqual(editor.focusOptions, { preventScroll: true });
  assert.equal(selection.removed, 1);
  assert.deepEqual(selection.added, [clonedRange]);
  assert.equal(rangeHasSelectedText(clonedRange), true);

  const outsideRange = { commonAncestorContainer: outsideNode, collapsed: false, toString: () => 'fora', cloneRange() { return this; } };
  selection.getRangeAt = () => outsideRange;
  assert.equal(captureEditorRange(editor, selection), null);
  assert.equal(restoreEditorRange(editor, selection, outsideRange), false);
  assert.equal(rangeHasSelectedText({ ...clonedRange, collapsed: true }), false);
});

test('editor preserves selection, skips self-authored DOM rewrites and exposes accessible controls', async () => {
  const source = await readFile(new URL('../src/components/rich-text-editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /document\.addEventListener\('selectionchange'/);
  assert.match(source, /onMouseDown=\{preserveSelectionOnToolbar\}/);
  assert.match(source, /restoreEditorRange\(editor, document\.getSelection\(\), savedRangeRef\.current\)/);
  assert.match(source, /lastEmittedHtmlRef\.current === value/);
  assert.match(source, /role="toolbar"/);
  assert.match(source, /role="textbox"/);
  assert.match(source, /aria-multiline="true"/);
  assert.match(source, /aria-pressed=/);
  assert.doesNotMatch(source, /window\.prompt\('Informe a URL da imagem'/);
  assert.match(source, /Imagens na descrição ficam desativadas até existir upload seguro/);
});

test('toolbar retains every supported command and buttons cannot submit the product form', async () => {
  const source = await readFile(new URL('../src/components/rich-text-editor.tsx', import.meta.url), 'utf8');
  const commands = [
    'undo', 'redo', 'bold', 'italic', 'underline', 'strikeThrough', 'formatBlock',
    'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter',
    'justifyRight', 'justifyFull', 'createLink', 'unlink', 'foreColor', 'backColor',
    'removeFormat'
  ];

  for (const command of commands) assert.match(source, new RegExp(`['"]${command}['"]`), command);
  const buttonTags = source.match(/<button\b[\s\S]*?>/g) || [];
  assert.ok(buttonTags.length >= 5);
  for (const button of buttonTags) assert.match(button, /type="button"/);
  assert.match(source, /Ctrl\+B, Ctrl\+I e Ctrl\+U/);
});

test('product form and catalog use the shared sanitized editor without visual bold inheritance', async () => {
  const productSource = await readFile(new URL('../src/app/(dashboard)/products/page.tsx', import.meta.url), 'utf8');
  const catalogSource = await readFile(new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url), 'utf8');

  assert.match(productSource, /<RichTextEditor/);
  assert.match(productSource, /htmlFor="product-description-editor"/);
  assert.match(productSource, /description: cleanDescription/);
  assert.match(productSource, /sanitizeRichTextHtml\(description\)/);
  assert.match(catalogSource, /sanitizeProductDescription\(product\?\.description \|\| ''\)/);
  assert.match(catalogSource, /rich-text-description mt-2 text-xs font-normal/);
  assert.doesNotMatch(catalogSource, /rich-text-description mt-2 text-xs font-medium/);
});
