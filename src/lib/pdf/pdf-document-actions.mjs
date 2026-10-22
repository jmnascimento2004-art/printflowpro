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
  const href = browser.URL.createObjectURL(blob);
  const frame = browser.document.createElement('iframe');
  frame.title = 'Impressão do documento';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0';
  let timer;
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    browser.clearTimeout(timer);
    frame.onload = null;
    frame.onerror = null;
    frame.remove();
    browser.URL.revokeObjectURL(href);
  };
  const ready = new Promise((resolve, reject) => {
    frame.onload = () => {
      if (disposed) return;
      // This watchdog covers loading only. The native dialog may stay open for
      // any amount of time, and closing it is not a printing failure.
      browser.clearTimeout(timer);
      try {
        if (!frame.contentWindow) throw new Error('Print frame unavailable');
        frame.contentWindow.addEventListener('afterprint', () => {
          // Let print() return before removing its browsing context.
          browser.setTimeout(cleanup, 0);
        }, { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
        resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.onerror = () => { cleanup(); reject(new Error('Print PDF unavailable')); };
    timer = browser.setTimeout(() => { cleanup(); reject(new Error('Print PDF timed out')); }, 60_000);
    frame.src = href;
    browser.document.body.appendChild(frame);
  });
  return ready;
}
