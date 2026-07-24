import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const viewerPath = new URL('../src/components/pdf/pdf-preview-viewer.tsx', import.meta.url);
const dialogPath = new URL('../src/components/pdf/pdf-preview-dialog.tsx', import.meta.url);

test('close control is a separate accessible 40px header action', async () => {
  const source = await readFile(viewerPath, 'utf8');
  const closeButton = source.slice(source.indexOf('{onClose && ('), source.indexOf('</button>', source.indexOf('{onClose && (')) + 9);

  assert.match(closeButton, /type="button"/);
  assert.match(closeButton, /onClick=\{onClose\}/);
  assert.match(closeButton, /aria-label="Fechar visualização do PDF"/);
  assert.match(closeButton, /title="Fechar"/);
  assert.match(closeButton, /h-10 w-10/);
  assert.match(closeButton, /shrink-0/);
  assert.match(closeButton, /focus-visible:ring-2/);
  assert.doesNotMatch(closeButton, /\babsolute\b|\bright-\d|\btop-\d|-m[trblxy]?-/);
});

test('header keeps title, wrapping actions and close control in distinct areas', async () => {
  const source = await readFile(viewerPath, 'utf8');
  const titleIndex = source.indexOf('min-w-0 flex-1');
  const actionsIndex = source.indexOf('flex min-w-0 flex-1 flex-wrap items-center gap-2');
  const closeIndex = source.indexOf('{onClose && (');

  assert.ok(titleIndex > -1);
  assert.ok(actionsIndex > titleIndex);
  assert.ok(closeIndex > actionsIndex);
  assert.match(source, /whitespace-nowrap[^"]*rounded-xl/);
  assert.match(source, /flex w-full items-start gap-2 sm:w-auto sm:items-center/);
});

test('dialog closes on Escape and restores focus after unmount', async () => {
  const source = await readFile(dialogPath, 'utf8');

  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /onOpenChange\(false\)/);
  assert.match(source, /previouslyFocused instanceof HTMLElement/);
  assert.match(source, /previouslyFocused\.focus\(\)/);
});

test('dialog no longer renders an absolutely positioned close control', async () => {
  const source = await readFile(dialogPath, 'utf8');

  assert.doesNotMatch(source, /aria-label="Fechar visualiza/);
  assert.doesNotMatch(source, /absolute right-3 top-3/);
  assert.match(source, /onClose=\{\(\) => onOpenChange\(false\)\}/);
});
