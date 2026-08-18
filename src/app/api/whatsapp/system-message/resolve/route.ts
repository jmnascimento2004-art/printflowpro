import { NextResponse } from 'next/server';
import {
  authorizeSystemMessageContext,
  authorizeWhatsAppCenterPreview,
  WhatsAppSystemMessageAccessError
} from '@/lib/whatsapp/system-message-auth.server';
import { resolveSystemWhatsAppMessage } from '@/lib/whatsapp/system-message-resolver.server';
import { getWhatsAppTimeGreeting } from '@/lib/utils';
import { getWhatsAppTemplateDefinition } from '@/lib/whatsapp/template-registry';
import { validateWhatsAppTemplate } from '@/lib/whatsapp/template-engine';
import { resolveWhatsAppCompanyVariables } from '@/lib/whatsapp/variable-resolver.server';
import { resolveWhatsAppProductVariables } from '@/lib/whatsapp/customer-product-variable-resolver.server';
import { isWhatsAppEventKey, type WhatsAppEventKey, type WhatsAppSystemMessageContext } from '@/lib/whatsapp/variable-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTEXTUAL_EVENTS = new Set<WhatsAppEventKey>([
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
  eventKey: WhatsAppEventKey;
  contextId?: string;
  draftContent?: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !['eventKey', 'contextId', 'draftContent'].includes(key))) return null;
  if (typeof body.eventKey !== 'string' || !isWhatsAppEventKey(body.eventKey)) return null;
  if (body.contextId !== undefined && (
    typeof body.contextId !== 'string' || !body.contextId.trim() || body.contextId.length > 128
  )) return null;
  if (body.draftContent !== undefined && typeof body.draftContent !== 'string') return null;
  return {
    eventKey: body.eventKey,
    ...(body.contextId === undefined ? {} : { contextId: body.contextId.trim() }),
    ...(body.draftContent === undefined ? {} : { draftContent: body.draftContent })
  };
}

function resolvePixPreviewVariables(variables: Record<string, string>) {
  const key = variables['empresa.pix_chave'] || '';
  const keyType = variables['empresa.pix_tipo'] || '';
  const beneficiary = variables['empresa.pix_titular'] || '';
  const bank = variables['empresa.banco'] || '';
  const typeLabels: Record<string, string> = {
    cnpj: 'CNPJ', cpf: 'CPF', celular: 'telefone', email: 'e-mail', aleatoria: 'aleatória'
  };
  const security = [
    beneficiary ? `Favorecido: ${beneficiary}` : '',
    bank ? `Banco: ${bank}` : ''
  ].filter(Boolean).join(' · ');
  return {
    chave_pix: key,
    chave_pix_rotulo: key ? `Chave PIX (${typeLabels[keyType] || 'configurada'})` : '',
    seguranca_pix: security
  };
}

async function resolveWithoutContext(
  trustedCompanyId: string,
  eventKey: WhatsAppEventKey,
  draftContent?: string,
  productId?: string
) {
  const definition = getWhatsAppTemplateDefinition(eventKey);
  if (!definition) throw new Error('WHATSAPP_SYSTEM_MESSAGE_RESOLUTION_UNKNOWN_EVENT');
  const validation = draftContent === undefined ? null : validateWhatsAppTemplate(draftContent, definition);
  const content = validation?.normalized || definition.defaultContent;
  if (validation && !validation.valid) {
    throw new Error('WHATSAPP_SYSTEM_MESSAGE_RESOLUTION_TEMPLATE_INVALID');
  }
  const company = await resolveWhatsAppCompanyVariables({
    companyId: trustedCompanyId,
    trustedCompanyId,
    eventKey
  });
  const product = eventKey === 'store_product_request' && productId
    ? await resolveWhatsAppProductVariables({
        trustedCompanyId,
        productId,
        eventKey,
        requireCatalogAvailability: true,
        selectedOptionsPresent: false
      })
    : null;
  const productVariables: Record<string, string> = product?.variables || {};
  const values: Record<string, string> = {
    ...company.variables,
    ...productVariables,
    ...resolvePixPreviewVariables(company.variables),
    saudacao: getWhatsAppTimeGreeting()
  };
  const variables = Object.fromEntries(definition.allowedVariables.map((variable) => [
    variable,
    values[variable] || 'Sem contexto selecionado'
  ]));
  const missing = definition.allowedVariables.filter((variable) => !values[variable]);
  return {
    eventKey,
    renderedContent: content,
    variables,
    recipientAvailable: false,
    testHref: '',
    missing,
    contextSummary: product
      ? `Produto — ${productVariables['produto.nome'] || 'Produto selecionado'}`
      : 'Sem contexto selecionado',
    variablesState: missing.length === 0 ? 'complete' : 'partial'
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
  if (message.endsWith('_PRODUCT_NOT_FOUND') || message.endsWith('_PRODUCT_NOT_PUBLIC')) {
    return ['O produto selecionado não está mais disponível no catálogo.', 404] as const;
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

    const contextualRequest = Boolean(body.contextId && CONTEXTUAL_EVENTS.has(body.eventKey));
    const { trustedCompanyId } = contextualRequest
      ? await authorizeSystemMessageContext(request, body.eventKey as ContextualEventKey)
      : await authorizeWhatsAppCenterPreview(request, body.eventKey);
    if (!contextualRequest) {
      return noStoreJson(await resolveWithoutContext(
        trustedCompanyId,
        body.eventKey,
        body.draftContent,
        body.eventKey === 'store_product_request' ? body.contextId : undefined
      ));
    }
    const resolved = await resolveSystemWhatsAppMessage({
      trustedCompanyId,
      context: buildContext(body.eventKey as ContextualEventKey, body.contextId!),
      draftContent: body.draftContent,
      allowMissingRecipient: true
    });

    return noStoreJson({
      eventKey: resolved.eventKey,
      variables: resolved.variables,
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
