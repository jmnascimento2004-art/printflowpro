export function createPdfResponseHeaders(filename, download = false) {
  const safeFilename = String(filename).replace(/["\r\n]/g, '_');

  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeFilename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  };
}
