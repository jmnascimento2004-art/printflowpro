// Each action receives the PDF already loaded by the viewer. Never regenerate it here.
export function downloadPdfDocument({ blob, filename }, browser = window) {
  const href = browser.URL.createObjectURL(blob);
  const link = browser.document.createElement('a');
  link.href = href;
  link.download = filename;
  browser.document.body.appendChild(link);
  link.click();
  link.remove();
  browser.setTimeout(() => browser.URL.revokeObjectURL(href), 1000);
}

export function printPdfDocument({ blob }, browser = window) {
  const popup = browser.open('about:blank', '_blank');
  if (!popup) throw new Error('Print window blocked');
  popup.opener = null;
  const href = browser.URL.createObjectURL(blob);
  popup.addEventListener('load', () => {
    popup.focus();
    popup.print();
  }, { once: true });
  popup.location.replace(href);
  browser.setTimeout(() => browser.URL.revokeObjectURL(href), 60_000);
}
