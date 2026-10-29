import { pipelineHomeHtml, pipelineHtmlResponse } from '@/lib/pipeline-pages';

// Standalone HTML avoids the store's authentication, branding and PWA providers.
export function GET() {
  return pipelineHtmlResponse(pipelineHomeHtml());
}
