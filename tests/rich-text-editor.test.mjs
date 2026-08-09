import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  captureEditorRange,
  normalizeRichTextHtml,
  normalizeRichTextUrl,
  rangeBelongsToEditor,
  rangeHasSelectedText,
  richTextToPlainText,
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

test('converts sanitized rich text to readable plain text for message channels', () => {
  const input = '<p>Banner <strong>premium</strong><br>Segunda linha</p><ul><li>Primeiro</li><li>Segundo</li></ul><script>alert(1)</script><style>body{display:none}</style>';
  assert.equal(
    richTextToPlainText(input),
    'Banner premium\nSegunda linha\n- Primeiro\n- Segundo'
  );
  assert.equal(richTextToPlainText('<p>Seguro</p><script>alert(1)'), 'Seguro');
});

test('removes entity-encoded executable content without damaging legitimate encoded text', () => {
  assert.equal(richTextToPlainText('&lt;script&gt;alert(1)&lt;/script&gt;'), '');
  assert.equal(richTextToPlainText('&lt;style&gt;body{display:none}&lt;/style&gt;'), '');
  assert.equal(
    richTextToPlainText('Produto premium&lt;script&gt;alert(1)&lt;/script&gt;Tamanho A4'),
    'Produto premiumTamanho A4'
  );
  assert.equal(
    richTextToPlainText('Produto premium&lt;style&gt;body{display:none}&lt;/style&gt;Tamanho A4'),
    'Produto premiumTamanho A4'
  );
  assert.equal(richTextToPlainText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;'), '');
  assert.equal(richTextToPlainText('&lt;strong&gt;Premium&lt;/strong&gt;'), 'Premium');
  assert.equal(richTextToPlainText('&lt;p&gt;Parágrafo&lt;/p&gt;'), 'Parágrafo');
  assert.equal(richTextToPlainText('Use &lt; 10 unidades &amp; mantenha o texto'), 'Use < 10 unidades & mantenha o texto');
});

test('removes numeric and mixed entity executable blocks with bounded decoding', () => {
  for (const input of [
    '&#60;script&#62;alert(1)&#60;/script&#62;',
    '&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;',
    '&#X3C;script&#X3E;alert(1)&#X3C;/script&#X3E;',
    '&lt;script&#62;alert(1)&lt;/script&#62;',
    '&#60;script&gt;alert(1)&#60;/script&gt;',
    '&amp;#60;script&amp;#62;alert(1)&amp;#60;/script&amp;#62;',
    '&amp;#x3c;script&amp;#x3e;alert(1)&amp;#x3c;/script&amp;#x3e;',
    '&amp;amp;#60;script&amp;amp;#62;alert(1)&amp;amp;#60;/script&amp;amp;#62;',
    '&#60;style&#62;body{display:none}&#60;/style&#62;',
    '&#x3c;style&#x3e;.x{color:red}&#x3c;/style&#x3e;',
    '&#x3c;style&gt;.x{color:red}&#x3c;/style&gt;'
  ]) {
    assert.equal(richTextToPlainText(input), '', input);
  }
  assert.equal(
    richTextToPlainText('Produto premium&#60;script&#62;alert(1)&#60;/script&#62;Tamanho A4'),
    'Produto premiumTamanho A4'
  );
  assert.equal(
    richTextToPlainText('Produto premium&#x3c;style&#x3e;.x{color:red}&#x3c;/style&#x3e;Tamanho A4'),
    'Produto premiumTamanho A4'
  );
  assert.equal(richTextToPlainText('5 &#60; 10'), '5 < 10');
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

test('color controls are unified accessible buttons with horizontal live swatches', async () => {
  const source = await readFile(new URL('../src/components/rich-text-editor.tsx', import.meta.url), 'utf8');
  const colorControl = source.slice(source.indexOf('function RichTextColorControl'), source.indexOf('export function RichTextEditor'));

  assert.match(colorControl, /type="button"/);
  assert.match(colorControl, /aria-label=\{label\}/);
  assert.match(colorControl, /aria-pressed=\{active\}/);
  assert.match(colorControl, /title=\{label\}/);
  assert.match(colorControl, /onMouseDown=\{onPreserveSelection\}/);
  assert.match(colorControl, /onClick=\{\(\) => inputRef\.current\?\.click\(\)\}/);
  assert.match(colorControl, /type="color"/);
  assert.match(colorControl, /tabIndex=\{-1\}/);
  assert.match(colorControl, /data-color-swatch="horizontal"/);
  assert.match(colorControl, /h-1 w-6/);
  assert.match(colorControl, /h-10 min-w-11 shrink-0/);
  assert.match(colorControl, /backgroundColor: value/);
  assert.match(colorControl, /border-black\/20/);
  assert.doesNotMatch(colorControl, /(?:-mt-|-mr-|-mb-|-ml-|-translate-|overflow-(?:hidden|clip)|h-5 w-5)/);
});

test('text and background color controls keep selection commands and form safety', async () => {
  const source = await readFile(new URL('../src/components/rich-text-editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /label="Cor do texto"[\s\S]*shortLabel="A"[\s\S]*onChange=\{\(nextColor\) => runCommand\('foreColor', nextColor\)\}/);
  assert.match(source, /label="Cor de fundo"[\s\S]*shortLabel="Bg"[\s\S]*onChange=\{\(nextColor\) => runCommand\('backColor', nextColor\)\}/);
  assert.match(source, /onPreserveSelection=\{preserveSelectionOnToolbar\}/g);
  assert.match(source, /style=\{shortLabel === 'A' \? \{ color: value \} : undefined\}/);
  assert.match(source, /textColorActive = Boolean\(selectedElement\?\.closest\('\[style\*="color"\]'\)\)/);
  assert.match(source, /backgroundColorActive = Boolean\(selectedElement\?\.closest\('\[style\*="background"\]'\)\)/);
});
