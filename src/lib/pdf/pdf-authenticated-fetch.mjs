export class PdfFetchError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PdfFetchError';
    this.status = status;
  }
}

function getSafeFilename(value) {
  let decoded = '';
  try {
    decoded = value ? decodeURIComponent(value.replace(/"/g, '')) : '';
  } catch {
    decoded = '';
  }
  const basename = decoded.split(/[\\/]/).pop() || '';
  return basename.replace(/[\r\n<>:"|?*\x00-\x1f]/g, '_').trim();
}

export function getPdfFilename(contentDisposition, fallbackFilename = 'download.pdf') {
  const utfFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainFilename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  return getSafeFilename(utfFilename || plainFilename || fallbackFilename) || 'download.pdf';
}

export async function fetchAuthenticatedPdf(url, options) {
  const accessToken = await options.getAccessToken();
  if (!accessToken) {
    throw new PdfFetchError(401, 'Sua sessao expirou. Entre novamente para acessar o PDF.');
  }

  const origin = options.origin || globalThis.location?.origin;
  if (!origin) throw new PdfFetchError(400, 'Origem invalida para acessar o PDF.');

  const target = new URL(url, origin);
  if (target.origin !== origin) {
    throw new PdfFetchError(400, 'O PDF so pode ser acessado na origem atual.');
  }

  let response;
  try {
    response = await (options.fetchImpl || globalThis.fetch)(target.href, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error'
    });
  } catch {
    throw new PdfFetchError(0, 'Nao foi possivel acessar o PDF.');
  }

  if (!response.ok) {
    throw new PdfFetchError(response.status, `Nao foi possivel acessar o PDF (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/pdf')) {
    throw new PdfFetchError(502, 'O servidor retornou um formato inesperado para o PDF.');
  }

  return {
    blob: await response.blob(),
    filename: getPdfFilename(response.headers.get('content-disposition') || '', options.fallbackFilename)
  };
}
