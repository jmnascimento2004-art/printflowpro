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

export async function renderPdfPrintPages(blob, browser = window, renderer) {
  const pdfjs = renderer || await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pages = [];
  const dispose = () => { for (const page of pages) browser.URL.revokeObjectURL(page.url); };
  try {
    const pdf = await task.promise;
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const physical = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 300 / 72 });
      const canvas = browser.document.createElement('canvas');
      try {
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Print canvas unavailable');
        await page.render({ canvasContext: context, viewport }).promise;
        const image = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Print image unavailable')), 'image/png'));
        pages.push({ url: browser.URL.createObjectURL(image), widthMm: physical.width * 25.4 / 72, heightMm: physical.height * 25.4 / 72 });
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    return { pages, dispose };
  } catch (error) { dispose(); throw error; }
  finally { try { await task.destroy(); } catch { /* Release is best-effort after rendering. */ } }
}

export async function printPdfDocument({ blob }, browser = window, preparePages = renderPdfPrintPages) {
  const prepared = await preparePages(blob, browser);
  if (!prepared.pages.length) { prepared.dispose(); throw new Error('Empty print document'); }
  const first = prepared.pages[0];
  // These are full pages rasterized from the PDF at 300 dpi, never screenshots
  // of the application. Physical PDF dimensions determine the print paper size.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Documento PrintFlowPRO</title><style>@page{size:${first.widthMm}mm ${first.heightMm}mm;margin:0}html,body{margin:0;padding:0}img{display:block;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}</style></head><body>${prepared.pages.map(page => `<img alt="" src="${page.url}" style="width:${page.widthMm}mm;height:${page.heightMm}mm">`).join('')}</body></html>`;
  const frame = browser.document.createElement('iframe');
  frame.title = 'Impressão do documento';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
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
    prepared.dispose();
  };
  const ready = new Promise((resolve, reject) => {
    frame.onload = () => {
      if (disposed) return;
      // This watchdog covers loading only. The native dialog may stay open for
      // any amount of time, and closing it is not a printing failure.
      browser.clearTimeout(timer);
      try {
        if (!frame.contentWindow) throw new Error('Print frame unavailable');
        const images = Array.from(frame.contentDocument.querySelectorAll('img'));
        if (images.length !== prepared.pages.length || images.some(image => !image.complete || !image.naturalWidth)) throw new Error('Print pages unavailable');
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
    frame.srcdoc = html;
    browser.document.body.appendChild(frame);
  });
  return ready;
}
