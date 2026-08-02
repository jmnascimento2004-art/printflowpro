import type { WhatsAppTemplateDefinition } from './types';

const COMMON_SAMPLES = {
  cliente_nome: 'Maria Silva',
  empresa_nome: 'CibelePRINT',
  saudacao: 'Olá',
  orcamento_codigo: 'ORC-0018',
  pedido_codigo: 'PED-0017',
  produto_nome: 'Cartões de visita',
  status_pedido: 'Concluído (Pronto para Retirada/Entrega)',
  valor_total: 'R$ 253,20',
  saldo_pendente: 'R$ 100,00',
  validade_orcamento: '06/08/2026',
  chave_pix_rotulo: 'Chave PIX (e-mail)',
  chave_pix: 'financeiro@empresa.com.br',
  seguranca_pix: '',
  tipo_venda: 'Unidade',
  quantidade: '1',
  medidas: '9cm x 5cm',
  metragem: '',
  opcoes: 'Papel: Couchê 300g | Acabamento: Laminação fosca',
  prazo: '2 dias úteis',
  cliente_telefone: '(51) 99999-9999',
  observacoes: 'Entregar no balcão.'
} as const;

export const WHATSAPP_TEMPLATE_REGISTRY = [
  {
    eventKey: 'quote_proposal',
    name: 'Proposta de orçamento',
    category: 'Orçamentos',
    description: 'Mensagem preparada ao abrir uma proposta de orçamento no WhatsApp.',
    defaultContent: `Olá, {{cliente_nome}}! Tudo bem?

Segue a proposta/orçamento #{{orcamento_codigo}} da {{empresa_nome}}.

Valor total: {{valor_total}}
Validade: {{validade_orcamento}}

Estou enviando o PDF do orçamento para sua conferência.
Por segurança do navegador, o PDF deve ser anexado manualmente nesta conversa.

Qualquer dúvida, fico à disposição.

Atenciosamente
{{empresa_nome}}`,
    allowedVariables: ['cliente_nome', 'orcamento_codigo', 'empresa_nome', 'valor_total', 'validade_orcamento'],
    sampleVariables: COMMON_SAMPLES,
    enabledByDefault: true
  },
  {
    eventKey: 'order_payment_pending',
    name: 'Cobrança PIX do pedido',
    category: 'Pedidos',
    description: 'Cobrança manual do saldo pendente de um pedido.',
    defaultContent: `{{saudacao}}, *{{cliente_nome}}*! 👋
Olá, tudo bem?

Segue a cobrança do seu pedido *{{pedido_codigo}}*:

💰 *Valor a pagar:* *{{saldo_pendente}}*

🔑 *{{chave_pix_rotulo}}:*
{{chave_pix}}{{seguranca_pix}}

✅ Após realizar o pagamento, por favor nos envie o comprovante por aqui.

Qualquer dúvida, estamos à disposição! 😊

Atenciosamente,
*{{empresa_nome}}*`,
    allowedVariables: ['saudacao', 'cliente_nome', 'pedido_codigo', 'saldo_pendente', 'chave_pix_rotulo', 'chave_pix', 'seguranca_pix', 'empresa_nome'],
    sampleVariables: COMMON_SAMPLES,
    enabledByDefault: true
  },
  {
    eventKey: 'production_status_changed',
    name: 'Atualização da produção',
    category: 'Produção',
    description: 'Mensagem manual sobre o avanço de um item na fila de produção.',
    defaultContent: `{{saudacao}}, *{{cliente_nome}}*!

Passando para informar que o seu pedido *{{pedido_codigo}}* (*{{produto_nome}}*) avançou na nossa linha de produção e agora está na fase de: *{{status_pedido}}*.

Qualquer dúvida, estamos à disposição!

Atenciosamente,
*{{empresa_nome}}*`,
    allowedVariables: ['saudacao', 'cliente_nome', 'pedido_codigo', 'produto_nome', 'status_pedido', 'empresa_nome'],
    sampleVariables: COMMON_SAMPLES,
    enabledByDefault: true
  },
  {
    eventKey: 'store_product_request',
    name: 'Solicitação de produto da loja',
    category: 'Atendimento',
    description: 'Pedido manual de atendimento para produto sem compra direta no catálogo.',
    defaultContent: `Olá! Gostaria de solicitar este produto:

Empresa: {{empresa_nome}}
Produto: {{produto_nome}}
Tipo: {{tipo_venda}}
Quantidade: {{quantidade}}
Medidas: {{medidas}}
Metragem: {{metragem}}
Opções: {{opcoes}}
Prazo: {{prazo}}
Total estimado: {{valor_total}}
Cliente: {{cliente_nome}}
Telefone: {{cliente_telefone}}
Observações: {{observacoes}}

Aguardo atendimento.`,
    allowedVariables: ['empresa_nome', 'produto_nome', 'tipo_venda', 'quantidade', 'medidas', 'metragem', 'opcoes', 'prazo', 'valor_total', 'cliente_nome', 'cliente_telefone', 'observacoes'],
    sampleVariables: COMMON_SAMPLES,
    enabledByDefault: true
  }
] as const satisfies readonly WhatsAppTemplateDefinition[];

export type WhatsAppEventKey = (typeof WHATSAPP_TEMPLATE_REGISTRY)[number]['eventKey'];

export function getWhatsAppTemplateDefinition(eventKey: string) {
  return WHATSAPP_TEMPLATE_REGISTRY.find((definition) => definition.eventKey === eventKey);
}
