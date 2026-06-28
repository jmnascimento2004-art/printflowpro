export async function downloadFileFromUrl(url: string, fallbackFilename = 'download.pdf'): Promise<void> {
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filename = getFilenameFromContentDisposition(contentDisposition) || fallbackFilename;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function getFilenameFromContentDisposition(value: string): string {
  const utfFilename = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utfFilename) return decodeURIComponent(utfFilename.replace(/"/g, ''));

  const filename = value.match(/filename="?([^";]+)"?/i)?.[1];
  return filename ? filename.trim() : '';
}
