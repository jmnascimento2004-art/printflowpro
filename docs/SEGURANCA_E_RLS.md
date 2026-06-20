# Seguranca e RLS

## Tabelas pessoais protegidas

- `customers`
- `store_customer_accounts`
- `customer_addresses`
- `quotes`
- `quote_items`
- `orders`
- `order_items`
- `customer_consents`
- `cookie_preferences`
- `data_subject_requests`
- `privacy_audit_events`

## Principios aplicados

- RLS habilitado nas novas tabelas publicas.
- Politicas `TO authenticated` sempre combinadas com predicado de posse por `auth.uid()`, `customer_id` e `company_id`.
- Cliente final visualiza apenas dados vinculados a sua conta em `store_customer_accounts`.
- Solicitação publica LGPD nao revela se e-mail ou CPF existe.
- `company_id` usado pelo navegador e validado por dominio na funcao de criacao da conta do cliente.
- Nenhuma `service_role` deve ser exposta no frontend.

## Cuidados com funcoes

- `ensure_store_customer_account` e `SECURITY DEFINER` porque precisa vincular Auth, cliente e consentimentos; ela verifica `auth.uid()` e dominio/empresa antes de escrever.
- Funcoes privadas ficam no schema `private` e tem grants restritos.
- Advisors do Supabase devem ser executados no ambiente conectado antes da publicacao.

## Checklist de seguranca

- Verificar se todas as novas tabelas estao expostas apenas com grants necessarios.
- Confirmar RLS no Supabase apos aplicar migrations.
- Confirmar que rotas `/store/conta/*` nao vazam dados entre contas.
- Revisar logs para nao conter senha, token, CPF completo, CVV ou cartao.
- Usar HTTPS em producao.
