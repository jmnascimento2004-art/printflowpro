export function normalizeRichTextUrl(value: unknown, options?: { assumeHttps?: boolean }): string;
export function stripRichTextHtml(value?: string): string;
export function sanitizeRichTextHtml(value?: string): string;
export function normalizeRichTextHtml(value?: string): string;
export function rangeBelongsToEditor(editor: HTMLElement | null, range: Range | null): boolean;
export function captureEditorRange(editor: HTMLElement | null, selection: Selection | null): Range | null;
export function restoreEditorRange(editor: HTMLElement, selection: Selection | null, range: Range | null): boolean;
export function rangeHasSelectedText(range: Range | null): boolean;
