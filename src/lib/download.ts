import { fetchAuthenticatedPdf } from '@/lib/pdf/pdf-authenticated-client';

export async function downloadFileFromUrl(url: string, fallbackFilename = 'download.pdf'): Promise<void> {
  const { blob, filename } = await fetchAuthenticatedPdf(url, fallbackFilename);
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

export async function openPdfFromUrl(url: string): Promise<void> {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Popup blocked.');
  popup.opener = null;

  try {
    const { blob } = await fetchAuthenticatedPdf(url);
    const objectUrl = URL.createObjectURL(blob);
    popup.location.replace(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    popup.close();
    throw error;
  }
}
