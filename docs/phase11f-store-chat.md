# Store Chat — Fase 11F

Base auditada: `32f38343bf053c193bc66604ec1dfd7f97e8537a`.

## Fronteiras

O hostname validado por `resolveStoreBoundary` determina a empresa. O browser não escolhe empresa, cliente, remetente ou atendente. O visitante recebe um token aleatório de 256 bits em cookie host-only, HttpOnly, Secure em produção, SameSite Strict, restrito a `/api/store/chat`. Apenas SHA-256 é persistido, em schema privado. A sessão dura sete dias fixos no banco; renovar o cookie não renova essa autorização.

Uma conta de cliente é vinculada exclusivamente por `auth.getUser` e `store_customer_accounts` ativo no tenant. O chat não cria clientes. Após vínculo, logout, troca de conta ou desativação do vínculo impedem acesso pelo cookie residual. Pedidos só entram no contexto mediante esse vínculo e ownership canônico. O DTO público não contém contato interno, IDs de atendentes, informações financeiras, tokens ou hashes.

As tabelas públicas têm RLS e somente SELECT autenticado autorizado por `/attendance`; não há acesso `anon`. A API visitante usa RPC service-only. A central usa JWT do usuário com perfil ativo e permissões efetivas, incluindo configuração vazia como negação explícita para admin. Configurações e respostas rápidas são exclusivas do admin; transferência exige admin/gerente e destinatário elegível do mesmo tenant. Detalhes completos do Pedido continuam no módulo `/orders`, com sua autorização existente.

## Concorrência e persistência

Criação serializada por hash da sessão; envios e transições serializados por lock da conversa. UUID de comando por envio com fingerprint de conteúdo/remetente impede duplicação e reutilização com conteúdo diferente. Atribuição só vence quando a conversa está sem responsável; transferência compara o responsável esperado. Mensagens são append-only para usuários. Leitura usa cursores monotônicos separados por perfil e não altera mensagens.

Realtime é exclusivamente DB → UI. Central: Supabase Postgres Changes autenticado com RLS e filtro tenant. Público: SSE Node, autorizado por sessão, no máximo 45 segundos; subscription do servidor filtrada pelo ID derivado da sessão. Payloads service-role nunca chegam ao browser: apenas invalidação, seguida de REST/DTO validado. Subscribe/catch-up, heartbeat de 10s, reconexão após 6s e polling de 15s recuperam eventos perdidos. Componentes removem subscriptions, timers e leitores ao desmontar. Não há presença fictícia.

## Política operacional

- Texto de 1–2.000 caracteres, exibido como texto React escapado; HTML nunca executado.
- Criação por primeira mensagem, nunca por abrir widget. Limites persistentes por IP/tenant na API e 12 mensagens de visitante por minuto/conversa sob lock no banco.
- Primeira mensagem: open → waiting; assumir: in_progress; encerrar: closed. Nova mensagem durante a sessão válida reabre para waiting, sem responsável anterior. Token expirado exige nova conversa.
- SaaS: escrita exige a capacidade canônica `catalog` e assinatura gravável. Histórico e leitura continuam disponíveis em modo somente leitura. Não cria planos, cobrança ou quota paralela.
- Horários existentes são texto livre. Exibimos o horário cadastrado e o aviso configurado; não inferimos horários estruturados nem prometemos presença online.
- Sessão pública: 7 dias. Histórico operacional: preservado sem expurgo automático nesta fase. Revisão de necessidade recomendada a cada 180 dias pelo controlador, com pedidos LGPD pelo fluxo existente; anonimização/expurgo futuro deve ser explícito, auditado e transacional. Não há promessa de exclusão automática em 180 dias.
- Sem coleta obrigatória de nome, telefone ou e-mail. Não registrar corpo das mensagens, contatos ou tokens no Audit Log. Ações de atribuição, transferência, encerramento, reabertura, respostas e configurações têm eventos administrativos.

## Integrações e métricas

Orçamento é rascunho revisado no editor canônico. A associação da conversa só é persistida atomicamente quando o aggregate save canônico retorna UPDATED. Não se contabiliza abertura do editor como conversão. WhatsApp usa uma entrada adicional no resolver server-side existente, com resolução canônica de telefone/configurações e construção de URL. Mantém os quatro eventos e os seis consumidores anteriores. Apenas referência curta da conversa é preparada; ação explícita abre WhatsApp, sem autoenvio e sem transcrição.

Métricas de todo o histórico: novas, atendidas (primeira resposta), atualmente encerradas, média até primeira resposta, duração acumulada de ciclos assumidos e encerrados, orçamentos efetivamente salvos e preparações de escalada para WhatsApp. Preparar URL é intenção; não comprova mensagem enviada fora do sistema. Sem SLA, cobrança, CRM ou chatbot.

## Validação

O bootstrap do widget persiste o cookie antes de habilitar a primeira mensagem, sem criar conversa. O POST de criação exige esse cookie, eliminando a janela de duplicação após perda da resposta; Web Locks coordena bootstrap entre abas quando disponível. As respostas assíncronas de mutações são descartadas se a conversa/identidade tiver mudado.

A atribuição histórica de orçamento guarda apenas o ID como tombstone privado, validado atomicamente no save canônico; não usa FK que bloqueie a exclusão canônica de orçamento. Métricas preservam a conversão ocorrida. Uma correção de compatibilidade remove três policies restritivas instaladas pelo loop da Fase 11E numa tabela histórica de defaults sem grants, restabelecendo seu contrato de ausência de policies; não concede acesso a ela.

Testes SQL transacionais em `supabase/tests/phase11f_store_chat.test.sql`: 78 verificações focadas e 29 arquivos da suíte passaram. Node: 755 testes passaram, incluindo 14 focados no chat. A concorrência real em duas conexões SQL produziu um único vencedor. Typecheck, build e diff check passaram; lint sem erros, com 19 avisos preexistentes. Revisão independente final: zero BLOCKER/HIGH/MEDIUM/LOW acionáveis; 27 testes chat/permalink executados também pelo revisor.

Preview validado em desktop (1440), tablet (1024) e mobile (390): contexto do produto, mensagem anônima, resposta sem reload, não lidas, busca/filtros, atribuição, retomada após reload, encerramento/reabertura sem responsável, respostas rápidas e ações flutuantes separadas. O orçamento QA #1039 foi salvo pelo editor canônico e excluído em seguida; a conversão histórica foi preservada. WhatsApp apenas preparou URL canônica com referência curta, sem enviar mensagem. As duas conversas sintéticas foram encerradas e a resposta rápida QA desativada.

O usuário aceitou explicitamente a cobertura automatizada positiva de transferência e cliente autenticado/Pedido, pois o tenant tem somente um atendente elegível e nenhuma conta de cliente QA identificada. Esses cenários não são declarados como testes manuais positivos. Não foram criadas contas Auth, concedidas permissões ou ativados perfis para contornar essa limitação. O gate de publicação exige ainda checks do commit final, merge e smoke do deploy de Production.
