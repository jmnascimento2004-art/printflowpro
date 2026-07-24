export class PdfFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string);
}

export type AuthenticatedPdfResult = { blob: Blob; filename: string };
export type AuthenticatedPdfOptions = {
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin?: string;
  fallbackFilename?: string;
};

export function getPdfFilename(contentDisposition: string, fallbackFilename?: string): string;
export function fetchAuthenticatedPdf(url: string, options: AuthenticatedPdfOptions): Promise<AuthenticatedPdfResult>;
