# Fase 11B — Links de Pagamento

Base confirmada por fetch: `a89efa9c28da90e0e8bea907f586b3cd79444ee9`; main/origin iguais,
worktree/stage limpos e divergência 0/0. Branch `feat/phase11b-payment-links`.
Benchmark oficial preservado. B30/S10 exige confirmação verificada, idempotência e ledger único.

## Auditoria e escopo de provider

Não existe integração real com Cora, PicPay, Mercado Pago, Stripe ou Asaas no código/schema/configuração
remota auditada. Vercel tem Supabase e configuração de hostname Store; nenhuma credencial de gateway.
O PIX atual é EMV/chave local; envio pelo WhatsApp não confirma recebimento bancário.
Nenhum novo fornecedor foi escolhido ou instalado. A instrução explícita do usuário de usar adapter
agnóstico e modo seguro/QA prevalece sobre recomendações genéricas de provisionar gateway.

O adapter desta entrega é **QA**, sem API bancária, cartão, PIX real ou transferência. O link é uma
demonstração visível, nunca uma cobrança real disfarçada. Criação e confirmação QA exigem Order numa
allowlist privada privilegiada, com conta bancária e data de fixture. Browsers não podem criar essa
autorização nem obtê-la por prefixo/metadata do Order. Para Orders reais, criação falha com instrução
clara de que o provider real não está configurado. Não existe fallback silencioso para um gateway live.
Ativar cobranças reais exige escolha explícita do fornecedor, credenciais e contrato de webhook.

## Recebível canônico

Não existe tabela de parcelas/recebíveis independente. O Financeiro deriva saldo residual do Order
por `total − max(paid_amount, receitas ativas do ledger)`, preservando aliases históricos PED/ORD.
Se houver uma receita pendente específica, o link aponta a essa linha e exige seu valor integral;
baixa parcial dessa parcela não existe na arquitetura atual. Sem linha específica, o link aponta ao
saldo do Order e admite valor parcial positivo, em centavos, nunca superior ao saldo.
Links não reservam caixa/saldo: dois links podem representar o mesmo saldo, mas somente o valor
ainda devido é liquidável sob lock. O segundo recebimento incompatível vira divergência explícita.

Os corpos financeiros Phase4B foram extraídos para helpers privados comuns. Wrappers humanos mantêm
checks/contratos existentes. Confirmação verificada usa a autoridade do link e SYSTEM, sem impersonar
Admin/cliente ou aceitar company/actor do evento. Order e recebível são bloqueados nessa ordem.
No recebível específico, atualiza-se a receita existente e o crédito B2B; não se insere outra receita.
No saldo geral, usa-se o mesmo núcleo de recebimento do Order. A conta verificada evita espelhar o
recebimento online numa sessão física de PDV. O core online considera ledger quando cache está atrasado.
Produção usa `ensure_production_queue_for_order`; não se inventa transição comercial nova.

## Estados, expiração e segurança

Ativo/Processando/Pago/Cancelado/Divergente persistidos; Expirado e Estornado são derivados na leitura.
`expires_at` é o limite exclusivo da meia-noite Bahia seguinte; `expires_on` exibe exatamente o dia
escolhido. Expiração não depende de cron. Datas de criação filtram pelo dia civil Bahia, inclusive após 21h.
Cancelamento invalida o link, preserva histórico e rejeita pagamento confirmado. Confirmar após
cancelamento/expiração, saldo alterado, associação alterada ou valor incompatível gera divergência.
Estorno continua no Financeiro; status público acompanha a transação original sem apagá-la. Replay antigo
não cria novo pagamento depois de estorno. Reconciliar só reprocessa eventos previamente verificados,
com permissão admin/gerente + /financial; não corrige saldo automaticamente.

Token aleatório 256 bits, hash SHA256 único na tabela pública e bearer guardado apenas no schema privado.
URL `/pay/[token]`; nenhum ID interno na autoridade pública. Host autoritativo é conferido contra os
domínios persistidos do tenant. Preview aceita somente os hosts de deployment/branch dos envs Vercel;
nenhum x-forwarded-host é autoridade. DTO público mínimo: empresa/logo/cor, primeiro nome, referência,
valor, vencimento, status e modo QA. Sem ledger, telefone, documento, IDs, notas internas ou dados de outros Pedidos.
No-store/noindex/no-referrer; logo não recebe referrer contendo token. Página mobile sem CTA de cobrança real.

Webhook dedicado `/api/payments/webhook/qa`: HMAC SHA256 dos bytes crus + timestamp, comparação constante,
janela de 5 minutos, corpo até 8 KiB e contrato fechado. Secret dedicado aleatório 256 bits no schema
privado, acessível somente ao servidor service_role; nunca NEXT_PUBLIC, PIX ou log. Não há credencial live.
Evento único provider/event_id com hash do payload; pagamento externo único provider/payment_id.
Colisão concorrente entre tenants aborta a transação perdedora, incluindo efeito financeiro. Falha/40001
é retryable, sem ACK falso. Redirect/GET/status público jamais confirmam pagamento.

## UI, WhatsApp, relatório e auditoria

Financeiro → Links de Pagamento; ação em Contas a Receber; componente na aba Financeiro do Pedido.
Dashboard, lista, detalhe, filtros status/cliente/Pedido/provider/data, copiar/abrir/cancelar, preparar
WhatsApp, confirmação QA administrativa e conciliação. Modal usa o foco/trap/Escape canônico.
Operações têm busy/double-submit guard e UUID estável para retry do mesmo payload.
WhatsApp reutiliza autorização operacional, resolver e renderer canônicos, incluindo saudação, cliente,
assinatura/branding e active. Draft QA não inclui PIX real; URL deriva exclusivamente do link do tenant.
A interface prepara texto para conferência e não envia mensagem automaticamente.
Relatório/CSV próprio com atalho na Fase9; indicadores claramente QA. Receita financeira usa exclusivamente
a transação canônica existente, nunca o volume do link. Leituras limitadas aos 1.000 links/Orders mais recentes.

RLS e SELECT estrito /financial na tabela pública; escrita só RPC. Tokens, allowlist, secret, receipts,
eventos técnicos e rate buckets no schema privado, RLS e sem acesso browser. Helpers privados têm
search_path vazio e EXECUTE revogado inclusive service_role; somente endpoints/RPCs mínimos.
Criação limitada a 20/min/tenant; status público 60/min/IP; webhook 120/min/IP, buckets persistidos
com hash de IP e retenção de um dia. Não são logs de dados pessoais ou payload bruto.
Audit Log registra criação/cancelamento/confirmação/reconciliação; eventos técnicos mínimos separados.
Nenhum token/secret/dado bancário completo é incluído em Audit Log.

## Verificação em desenvolvimento

Testes focados cobrem HMAC/spoof/tampering/freshness/contrato, permissões, whitelist QA, valor/saldo,
recebível integral, token/host/DTO, retry/replay, snapshot de evento, baixa única, SYSTEM, concorrência,
cancelamento/expiração, reprocessamento, estorno, PED/ORD e cache financeiro atrasado.
Quatro cenários reais de concorrência local: colisão de evento entre tenants, retries idênticos,
baixa manual versus webhook e dois links para um saldo. Fixtures locais isoladas não são dados comerciais.
Revisão independente detectou e corrigiu colisão de evento, ordem de locks, recheck nullable do recebível,
data de vencimento, audit stale e filtro de criação UTC/Bahia.

Não declarar PASS antes de migration target-only, checks, Preview, revisão final, merge e Production/smoke.
Nenhuma cobrança real autorizada ou efetuada. Não iniciar 11C automaticamente.

Migration `20261023155715` aplicada target-only ao projeto confirmado `dyqqhhywiubjraxyebgr`.
O conector `apply_migration` falhou duas vezes por sessão expirada antes de executar; a ausência de
schema/versão foi confirmada. Dry-run da CLI recusou a divergência histórica antiga, sem aplicar nada.
Fallback oficial `supabase db query --linked --project-ref ... --file` executou exclusivamente o SQL
revisado e registrou a nova versão no mesmo BEGIN/COMMIT, com guard contra versão/schema preexistente.
Não houve repair/reset/include-all ou replay. Baseline remota de links e fixtures = 0.
Advisors pós-migration: nenhum novo FK sem índice; RLS sem policies no privado é intencional e sem grants.
As duas RPCs authenticated SECURITY DEFINER são intencionais e têm tenant/permissão/identidade verificados.
Avisos preexistentes de search_path e proteção de senha não foram ampliados.

## Evidência de Preview e ajuste de branding

Preview do PR #49 autenticado: criação real negada; fixtures QA históricas receberam 40 + 60 no mesmo
Order (paid_amount=100, pago), e um recebível específico de 50 foi liquidado na própria linha.
Cancelamento e expiração lógica, detalhe, foco/Shift+Tab/Escape, rascunho WhatsApp sem envio,
filtro de pagos, histórico verificado e CSV com cinco links conferidos. Webhook remoto sem assinatura: 401.
Diálogos e página pública conferidos em 1440, 768 e 390 px; tabelas usam rolagem local, sem overflow no body.
Migration aditiva `20261023171921` aplicada pelo conector: fallback logo_light/logo_url/logo_dark.
O logo existente é PNG data URI; a página aceita HTTPS ou raster base64 estritamente tipado, sem SVG.
pgTAP focado atualizado: 56 checks; revisão independente do resolver: 0 B/H/M/L.
Fixtures usam conta sintética e janeiro/2000. A compensação preserva os movimentos históricos brutos,
mesmo com saldo líquido zero; não representa qualquer cobrança externa. Limpeza e smoke final devem ser
confirmados antes do gate.
