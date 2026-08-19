# Fase 4E — Governança global do Audit Log

Data: 2026-08-19

Base: `2b868a5b461c19fff8a8b7e1b8e1b32eb39bac1a`

Branch: `feat/global-audit-governance`

## Padrão de governança

- A mutação canônica e o Audit Log pertencem à mesma transação no PostgreSQL.
- Ações humanas derivam ator de `auth.uid()` e do perfil ativo; `company_id` deriva da linha e é confrontado com o tenant do ator.
- Ações server-side sem usuário são registradas como `SYSTEM` somente quando o JWT autoritativo possui papel `service_role`. SQL administrativo direto, replay e fixtures não fabricam histórico.
- `audit_logs` é append-only para a aplicação: `authenticated` possui apenas `SELECT`, limitado por RLS a administradores do próprio tenant.
- `service_role` também não possui INSERT/UPDATE/DELETE direto no ledger; triggers e RPCs canônicas escrevem como funções `SECURITY DEFINER`. A FK da empresa usa `ON DELETE RESTRICT`, impedindo exclusão em cascata do histórico.
- UPDATEs guardam somente chaves pertinentes que realmente mudaram. CREATE/DELETE usam snapshots reduzidos.
- Senhas, tokens, service role, documentos, contatos pessoais, endereços, chaves PIX, conteúdo integral de templates e imagens não entram nos snapshots.
- RPCs que já geram um evento rico mantêm esse evento como canônico. Os triggers de `quotes` e `orders` são diferidos e suprimem o evento genérico somente quando encontram, na mesma transação e entidade, o evento rico existente. Efeitos independentes (por exemplo, ledger financeiro, cliente e caixa) permanecem distintos.
- A instalação de triggers consulta `to_regclass`. A allowlist de ausência opcional contém exclusivamente `company_default_services`; sua falta não cria a entidade fora de escopo. A ausência de qualquer tabela obrigatória aborta a migration com `PHASE4E_REQUIRED_TABLE_MISSING`, impedindo cobertura parcial silenciosa.
- Taxonomia: `module.entity_action`, preservando chaves consolidadas como `production.stage_changed` e `inventory.adjusted`.

## Matriz de cobertura

| MÓDULO | ENTIDADE | AÇÃO | FONTE CANÔNICA | CAMINHO DE ESCRITA | AUDIT LOG ATUAL | EVENT KEY | BEFORE/AFTER | ACTOR | TENANT | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| Produção | `production_queue` | criar item | banco | `ensure_production_queue_for_order` | trigger transacional | `production.item_created` | snapshot reduzido | humano/SYSTEM | linha + perfil | COVERED |
| Produção | `production_queue` | alterar fase | banco | `transition_production_stage` | RPC autoritativa | `production.stage_changed` | status | humano | RPC + lock | COVERED |
| Produção | `production_queue` | responsável/prioridade | banco | patch explícito | trigger transacional | `production.responsible_changed` / `production.priority_changed` | delta | humano | linha + perfil | COVERED |
| Produção | `production_queue` | remover | banco | delete autorizado | trigger transacional | `production.item_removed` | snapshot reduzido | humano | linha + perfil | COVERED |
| Clientes | `customers` | criar/editar/remover | banco | `customers.service` / persistence helper | trigger transacional | `customer.created/updated/deleted` | dados comerciais, sem PII | humano/SYSTEM | linha + perfil | COVERED |
| Fornecedores | `suppliers` | criar/editar/remover | banco | persistence helper; edição futura | trigger transacional | `supplier.created/updated/deleted` | nome somente | humano/SYSTEM | linha + perfil | COVERED |
| Produtos | `products` | criar/editar/remover | banco | persistence helper | trigger transacional | `product.created/updated/deleted` | delta comercial | humano/SYSTEM | linha + perfil | COVERED |
| Produtos | `products` | preço/configuração de preço | banco | patch explícito | trigger transacional | `product.price_changed` | valores + fingerprint reduzido | humano | linha + perfil | COVERED |
| Produtos | `products` | ativação/categoria | banco | patch explícito | trigger transacional | `product.status_changed` / `product.category_changed` | delta | humano | linha + perfil | COVERED |
| Categorias | `categories` | criar/editar/remover | banco | persistence helper | trigger transacional | `category.created/updated/deleted` | delta sem imagem | humano | linha + perfil | COVERED |
| Categorias | `categories` | hierarquia | banco | patch explícito | trigger transacional | `category.hierarchy_changed` | `parent_id` | humano | linha + perfil | COVERED |
| Catálogo | `categories` | destaque/Mega Menu | banco | Catálogo → categorias | trigger transacional | `catalog.category_featured_changed` / `catalog.mega_menu_changed` | delta sem imagem | humano | linha + perfil | COVERED |
| Catálogo | `store_banners` | criar/editar/status/ordem/excluir | banco | banner manager → persistence helper | trigger transacional | `catalog.banner_*` | delta sem URL de imagem | humano | linha + perfil | COVERED |
| Catálogo | `store_banners` | duplicar | banco | criação explícita de cópia inativa | mesmo evento canônico de criação | `catalog.banner_created` | snapshot da nova entidade | humano | linha + perfil | COVERED |
| Catálogo | `settings`/`companies` | +Vendidos/Promoções/Destaques/benefícios/aparência/rodapé/redes/políticas | banco | comandos explícitos do Catálogo/Configurações | trigger transacional | `catalog.configuration_changed` / `catalog.appearance_changed` | delta sanitizado | humano | linha + perfil | COVERED |
| Orçamentos | `quotes` + `quote_items` | criar/editar itens/desconto | banco | `save_quote_with_items_phase4b` | RPC autoritativa | `quote.created/updated` | cabeçalho + contagem de itens | humano | RPC + lock | COVERED |
| Orçamentos | `quotes` | aprovar/rejeitar/status/remover | banco | aprovação RPC / delete explícito | trigger transacional | `quote.approved/rejected/status_changed/deleted` | delta comercial | humano | linha + perfil | COVERED |
| Pedidos | `orders` + `order_items` | criar/editar itens | banco | `save_order_with_items_phase4b` | RPC autoritativa | `order.created/updated` | cabeçalho + contagem de itens | humano | RPC + lock | COVERED |
| Pedidos | `orders` | status/cancelamento | banco | `transition_order_status_phase4b` | RPC autoritativa | `order.status_changed` | status | humano | RPC + lock | COVERED |
| Financeiro | `financial_transactions` | criar/baixar/reverter/remover | banco | insert / `settle_financial_transaction` / pagamento | trigger transacional | `financial.transaction_created/payment_changed/transaction_deleted` | valor, referência, situação | humano | linha + perfil | COVERED |
| Estoque | `stock_movements` | entrada/saída/ajuste/consumo | banco | `adjust_inventory_stock` | trigger no movimento canônico | `inventory.adjusted` | movimento e motivo | humano | RPC + lock | COVERED |
| Estoque | `products.current_stock` | saldo derivado | banco | efeito da RPC de movimento | intencionalmente suprimido | — | — | — | — | NOT_REQUIRED |
| Expedição | `shipments` | criar/status/rastreio/transportadora/entrega/remover | banco | status de pedido / `transition_shipment` | trigger transacional | `shipment.created/status_changed/deleted` | delta sem endereço/cliente | humano | linha + perfil | COVERED |
| PDV/Caixa | `cash_register_sessions` | abrir/fechar/suprimento/sangria/ajuste | banco | `operate_cash_register` | trigger transacional | `cash_register.*` | saldo/situação | humano | RPC + lock | COVERED |
| PDV/Caixa | `cash_register_transactions` | linha interna do ledger | banco | efeito da operação de caixa/pagamento | evento da sessão/financeiro | — | — | — | — | NOT_REQUIRED |
| Pontos de coleta | `pickup_points` | criar/editar/ativar/desativar/remover | banco | persistence helper | trigger transacional | `pickup_point.*` | nome/status/horários | humano | linha + perfil | COVERED |
| Empresa | `companies` | identidade/marca/apresentação | banco | patch explícito | trigger transacional | `company.configuration_changed` / `catalog.appearance_changed` | delta sem PII/imagens | humano | id da empresa + perfil | COVERED |
| Configurações | `settings` | financeiro/operacional/PIX/Store | banco | patch explícito | trigger transacional | `settings.configuration_changed/financial_updated/pix_updated` | delta; chave PIX nunca exposta | humano | linha + perfil | COVERED |
| Configurações | `company_default_services` | criar/editar/remover, quando a tabela existir | banco | CRUD empresarial quando disponível | trigger transacional condicional à existência | `settings.default_service_*` | nome/preço/status | humano | linha + perfil | COVERED |
| Usuários | `profiles` | adicionar/editar/papel/status/remover | banco | CRUD de perfis | trigger transacional | `user.added/updated/role_changed/status_changed/removed` | nome/papel/status, sem contato | humano/SYSTEM | linha + perfil | COVERED |
| Permissões | `role_permissions` | conceder/remover acesso | banco | `save_role_permissions` | trigger por rota alterada | `user.permission_*` | papéis antes/depois | humano | RPC + perfil | COVERED |
| WhatsApp | `whatsapp_message_templates` | ativar/desativar/editar/restaurar | banco | serviço da Central | trigger transacional | `whatsapp.template_*` / `whatsapp.event_status_changed` | fingerprint/comprimento, sem conteúdo | humano | linha + perfil | COVERED |
| WhatsApp | `whatsapp_settings` | configuração | banco | serviço da Central | trigger transacional | `whatsapp.configuration_changed` | indicadores e modo, sem telefone/assinatura | humano | linha + perfil | COVERED |
| WhatsApp | `whatsapp_custom_messages` | criar/editar/remover | banco | serviço/RPC atômica | trigger transacional | `whatsapp.custom_message_*` | fingerprint/comprimento, sem conteúdo | humano | linha + perfil | COVERED |
| Store | `store_customer_favorites` | preferência do cliente | banco | contexto da Store | sem Audit Log empresarial | — | — | cliente | RLS própria | NOT_REQUIRED |
| Store/LGPD | consentimentos, cookies, solicitações, endereços | privacidade/autosserviço | banco | fluxos públicos/autenticados | histórico de privacidade próprio quando aplicável | domínio próprio | próprio | cliente | RLS própria | NOT_REQUIRED |
| Comercial | `quote_items` / `order_items` | lote interno do agregado | banco | RPC transacional do cabeçalho | evento agregado da cotação/pedido | `quote.*` / `order.*` | contagem/snapshot comercial | humano | RPC | NOT_REQUIRED |
| Configuração técnica | `company_footer_badge_defaults` | defaults globais server-only | banco | service role, sem UI tenant | nenhum | — | — | SYSTEM | global | SYSTEM_ONLY |
| Auditoria | `audit_logs` | append/read | banco | triggers/RPCs / painel admin | é o próprio ledger | — | — | humano/SYSTEM | RLS admin | SYSTEM_ONLY |

## Não duplicação e rollback

- `save_quote_with_items_phase4b`, `save_order_with_items_phase4b` e `transition_order_status_phase4b` mantêm os eventos ricos já existentes; o trigger diferido do cabeçalho identifica o evento rico pelo mesmo `company_id`, entidade, `entity_id` e transaction ID, evitando o duplicado sem depender de configuração de sessão.
- Pagamentos/baixas preservam eventos distintos para mudanças materiais no pedido, cliente, lançamento financeiro e caixa; esses efeitos não são tratados como duplicados porque representam entidades e estados diferentes.
- Estoque registra o movimento, não o update derivado de `products.current_stock`.
- Produção ignora no trigger a mudança de `status`, pois `transition_production_stage` já anexa `production.stage_changed`.
- Como o insert do Audit Log ocorre no mesmo transaction scope, qualquer exceção posterior reverte mutação e histórico juntos.

## Consulta administrativa e crescimento

- A tela usa paginação server-side de 25 registros, ordenada por `(created_at desc, id desc)`.
- Filtros: período, usuário, módulo, ação e identificador da entidade.
- Detalhes exibem before/after e deixam metadata técnica em seção avançada.
- CSV é produzido por Route Handler autenticado, com RLS do próprio usuário, no máximo 5.000 linhas por exportação.
- Índices atendem a timeline por tenant e buscas estruturadas por ator/entidade. A busca parcial por nome/identificador permanece limitada ao tenant e deve ser monitorada; `pg_trgm` só deve ser considerado quando volume e planos reais justificarem. Não há GIN indiscriminado em JSONB.
- Retenção automática não foi criada. O histórico é preservado; uma política futura deve ser baseada em requisitos legais, volume medido e backup.

## Riscos residuais

- O Audit Log não reconstrói eventos históricos anteriores à instrumentação.
- Production não possui atualmente `company_default_services`, cuja migration é anterior ao ledger remoto. A Fase 4E não fabrica essa entidade fora de escopo; o trigger é instalado automaticamente em ambientes em que a tabela existe, e não há mutação descoberta nessa tabela enquanto ela estiver ausente.
- A duplicação de banner é semanticamente uma criação de nova entidade e usa `catalog.banner_created`; não há evento adicional redundante.
- A exportação limita 5.000 registros por operação para evitar carga ilimitada. Períodos maiores devem ser exportados em intervalos.
- A exclusão de uma empresa com histórico passa a ser bloqueada. Qualquer retenção/anomização futura deverá ocorrer por procedimento privilegiado, documentado e separado da aplicação.
