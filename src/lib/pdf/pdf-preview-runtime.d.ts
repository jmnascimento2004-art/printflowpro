export type PreviewRenderTask = {
  cancel: () => void;
  promise: Promise<unknown>;
};

export type PreviewLoadingTask = {
  destroy: () => Promise<void> | void;
  promise: Promise<unknown>;
};

export type PdfPreviewRunController = {
  begin: () => number;
  isCurrent: (generation: number) => boolean;
  setLoadingTask: (generation: number, task: PreviewLoadingTask) => boolean;
  addRenderTask: (generation: number, task: PreviewRenderTask) => boolean;
  removeRenderTask: (task: PreviewRenderTask) => void;
  cancel: (generation: number) => void;
};

export function blobToPdfData(blob: Blob): Promise<Uint8Array>;
export function hasPdfSignature(data: Uint8Array): boolean;
export function createPdfPreviewRunController(): PdfPreviewRunController;
