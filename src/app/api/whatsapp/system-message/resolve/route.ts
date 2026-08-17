import { NextResponse } from 'next/server';
import {
  authorizeSystemMessageContext,
  WhatsAppSystemMessageAccessError
} from '@/lib/whatsapp/system-message-auth.server';
import { resolveSystemWhatsAppMessage } from '@/lib/whatsapp/system-message-resolver.server';
import type { WhatsAppSystemMessageContext } from '@/lib/whatsapp/variable-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTEXTUAL_EVENTS = new Set([
  'quote_proposal',
  'order_payment_pending',
  'production_status_changed'
]);

type ContextualEventKey = 'quote_proposal' | 'order_payment_pending' | 'production_status_changed';

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

function parseRequestBody(value: unknown): {
  eventKey: ContextualEventKey;
  contextId: string;
  draftContent?: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !['eventKey', 'contextId', 'draftContent'].includes(key))) return null;
  if (typeof body.eventKey !== 'string' || !CONTEXTUAL_EVENTS.has(body.eventKey)) return null;
  if (typeof body.contextId !== 'string' || !body.contextId.trim() || body.contextId.length > 128) return null;
  if (body.draftContent !== undefined && typeof body.draftContent !== 'string') return null;
  return {
    eventKey: body.eventKey as ContextualEventKey,
    contextId: body.contextId.trim(),
    ...(body.draftContent === undefined ? {} : { draftContent: body.draftContent })
  };
}

function buildContext(eventKey: ContextualEventKey, contextId: string): WhatsAppSystemMessageContext {
  if (eventKey === 'quote_proposal') return { eventKey, quoteId: contextId };
  if (eventKey === 'order_payment_pending') return { eventKey, orderId: contextId };
  return { eventKey, productionItemId: contextId };
}

function friendlyResolutionError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.endsWith('_TEMPLATE_INVALID')) return ['Corrija o conteúdo do modelo antes de gerar a mensagem.', 400] as const;
  if (message.endsWith('_PIX_NOT_CONFIGURED')) return ['Configure a chave PIX em Configurações → Finanças & Chave PIX para testar esta mensagem.', 422] as const;
  if (message.endsWith('_ORDER_NOT_PAYABLE')) return ['Este pedido não possui saldo pendente para cobrança.', 422] as const;
  if (message.endsWith('_QUOTE_NOT_FOUND') || message.endsWith('_ORDER_NOT_FOUND') || message.endsWith('_PRODUCTION_ITEM_NOT_FOUND')) {
    return ['O contexto selecionado não está mais disponível.', 404] as const;
  }
  if (message.endsWith('_TENANT_MISMATCH')) return ['O contexto selecionado não está disponível para esta empresa.', 404] as const;
  if (message.endsWith('_CUSTOMER_ID_MISSING') || message.endsWith('_CUSTOMER_NOT_FOUND')) {
    return ['O contexto selecionado não possui um cliente válido.', 422] as const;
  }
  return ['Não foi possível resolver a mensagem com os dados atuais.', 500] as const;
}

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return noStoreJson({ error: 'Requisição inválida.' }, 400);
    }
    const body = parseRequestBody(json);
    if (!body) return noStoreJson({ error: 'Requisição inválida.' }, 400);

    const { trustedCompanyId } = await authorizeSystemMessageContext(request, body.eventKey);
    const resolved = await resolveSystemWhatsAppMessage({
      trustedCompanyId,
      context: buildContext(body.eventKey, body.contextId),
      draftContent: body.draftContent,
      allowMissingRecipient: true
    });

    return noStoreJson({
      eventKey: resolved.eventKey,
      renderedContent: resolved.renderedContent,
      recipientAvailable: resolved.recipientAvailable,
      testHref: resolved.testHref,
      missing: resolved.missing,
      contextSummary: resolved.contextSummary,
      variablesState: resolved.missing.length === 0 ? 'complete' : 'partial'
    });
  } catch (error) {
    if (error instanceof WhatsAppSystemMessageAccessError) {
      return noStoreJson({ error: error.status === 401 ? 'Não autenticado.' : 'Acesso negado.' }, error.status);
    }
    const [message, status] = friendlyResolutionError(error);
    return noStoreJson({ error: message }, status);
  }
}
