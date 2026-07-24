const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'div', 'em', 'font', 'h1', 'h2', 'h3', 'i', 'img',
  'li', 'ol', 'p', 's', 'span', 'strong', 'u', 'ul'
]);

const BLOCK_TAGS = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'li', 'p']);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i;
const SAFE_TEXT_ALIGN = /^(?:left|center|right|justify)$/i;

function removeHtmlComments(value = '') {
  return value.replace(/<!--[\s\S]*?-->/g, '');
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function decodeRichTextEntities(value = '') {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    decoded = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&nbsp;/gi, ' ');
  }
  return decoded;
}

function getAttribute(markup, name) {
  const quoted = markup.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  if (quoted) return quoted[1];
  return markup.match(new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, 'i'))?.[1] || '';
}

function getStyleProperty(markup, property) {
  const style = getAttribute(markup, 'style');
  if (!style) return '';
  return style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))?.[1]?.trim() || '';
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return SAFE_COLOR.test(color) ? color : '';
}

export function normalizeRichTextUrl(value, { assumeHttps = false } = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const candidate = assumeHttps && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return '';

  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol.toLowerCase())
      ? candidate
      : '';
  } catch {
    return '';
  }
}

export function stripRichTextHtml(value = '') {
  return removeHtmlComments(decodeRichTextEntities(value))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeRichTextHtml(value = '') {
  const cleanValue = removeHtmlComments(String(value || ''))
    .replace(/<(script|style|iframe|object|embed|svg|math|template|link|meta)[\s\S]*?>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|template|link|meta)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(cleanValue);

  if (!hasHtml) {
    return escapeHtml(cleanValue).replace(/\r?\n/g, '<br />');
  }

  return cleanValue.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (markup, rawTag) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (markup.startsWith('</')) return tag === 'font' ? '</span>' : `</${tag}>`;
    if (tag === 'br') return '<br />';

    if (tag === 'a') {
      const href = normalizeRichTextUrl(getAttribute(markup, 'href'));
      if (!href) return '<a>';
      const external = /^https?:/i.test(href);
      return `<a href="${escapeAttribute(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>`;
    }

    if (tag === 'img') {
      const src = normalizeRichTextUrl(getAttribute(markup, 'src'));
      const alt = getAttribute(markup, 'alt');
      return /^https:\/\//i.test(src)
        ? `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" />`
        : '';
    }

    if (tag === 'font') {
      const color = normalizeColor(getAttribute(markup, 'color'));
      return color ? `<span style="color: ${color}">` : '<span>';
    }

    if (tag === 'span') {
      const color = normalizeColor(getStyleProperty(markup, 'color'));
      const background = normalizeColor(
        getStyleProperty(markup, 'background-color') || getStyleProperty(markup, 'background')
      );
      const styles = [
        color ? `color: ${color}` : '',
        background ? `background-color: ${background}` : ''
      ].filter(Boolean);
      return styles.length > 0 ? `<span style="${styles.join('; ')}">` : '<span>';
    }

    if (BLOCK_TAGS.has(tag)) {
      const alignment = getStyleProperty(markup, 'text-align');
      return SAFE_TEXT_ALIGN.test(alignment)
        ? `<${tag} style="text-align: ${alignment.toLowerCase()}">`
        : `<${tag}>`;
    }

    return `<${tag}>`;
  }).replace(/<a>([\s\S]*?)<\/a>/gi, '$1').trim();
}

export function normalizeRichTextHtml(value = '') {
  const decodedValue = removeHtmlComments(decodeRichTextEntities(String(value || '')));
  const decodedLooksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(decodedValue);
  return sanitizeRichTextHtml(decodedLooksLikeHtml ? decodedValue : removeHtmlComments(String(value || '')));
}

export function rangeBelongsToEditor(editor, range) {
  return Boolean(editor && range && editor.contains(range.commonAncestorContainer));
}

export function captureEditorRange(editor, selection) {
  if (!selection || selection.rangeCount < 1) return null;
  const range = selection.getRangeAt(0);
  return rangeBelongsToEditor(editor, range) ? range.cloneRange() : null;
}

export function restoreEditorRange(editor, selection, range) {
  if (!selection || !rangeBelongsToEditor(editor, range)) return false;
  editor.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function rangeHasSelectedText(range) {
  return Boolean(range && !range.collapsed && String(range).trim().length > 0);
}
