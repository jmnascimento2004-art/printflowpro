import { pipelinePrivacyHtml, pipelineHtmlResponse } from '@/lib/pipeline-pages';

export function GET() {
  return pipelineHtmlResponse(pipelinePrivacyHtml());
}
