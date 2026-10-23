# Fase 11C — Avaliações e mídia de produto

Base: `2898370d9f385c1a06a86876f0167e097d69687e`. Branch `feat/phase11c-product-reviews-media`.

## Fontes canônicas e regras

Produtos mantêm `image_url` e `pricing_details.gallery_images`: até três imagens PNG/JPEG/WEBP de 2 MiB, capa explícita e posição persistida. `pricing_details.video_url` acrescenta somente URL canônica YouTube/Vimeo. Vídeo fica separado da ordem de imagens. Não foi criada segunda galeria. Imagens legadas e referências externas existentes continuam compatíveis. A capa do vídeo usa a imagem do produto; o iframe externo só existe após clique, sem autoplay. Zoom/lightbox não integra esta fase.

Reviews exigem conta Store ativa, cliente e item do Pedido canônicos, produto visível e Pedido entregue/finalizado. Uma avaliação por produto/Pedido; compra posterior permite nova avaliação. Nota inteira 1–5; comentário opcional, até 1.000 caracteres Unicode, texto simples, sem contatos/URLs. Admin não edita o texto. Pendentes só aparecem após aprovação; rejeição/ocultação exigem motivo, restauração retorna à fila. Revisão otimista e histórico preservados.

Link `/store/review/[token]`: 256 bits aleatórios, hash persistido, 30 dias, revogável, rotação antes do uso, submissão única sob locks Order/token. A conta vinculada à compra é obrigatória, inclusive para impedir uso de link compartilhado. Token não entra em analytics. Média/quantidade incluem apenas aprovadas; autor anonimizado e mês/ano, sem identificadores do Pedido ou dados pessoais. A moderação manual deve rejeitar dados pessoais escritos livremente que ultrapassem os filtros simples.

Catálogo → Avaliações segue a permissão canônica de Catálogo/configurações; vínculo de Pedido e convites exigem também `/orders`. API resolve tenant no servidor. Browser não recebe grants nas tabelas de reviews/tokens. Funções privilegiadas têm grants mínimos e search_path vazio. Rate limit persistido, origem verificada e corpo limitado.

## Upload e retenção

Produtos, banners/catálogo e avatars usam `/api/products/media`, sessão validada e permissão do escopo. Tenant e ator vêm da sessão. Sharp valida o conteúdo real, limita pixels, remove metadata, orienta e reduz para WebP até 1600 px. Inventário privado registra arquivo antes do upload; hash evita duplicação. Sem SVG ou iframe arbitrário. Retirar imagem da galeria não apaga objeto físico compartilhado. Inventário também rastreia drafts não vinculados e falhas/retries; limpeza física futura requer reconciliação explícita de referências e retenção.

## Publicação expand/contract

A expansão `20261023184108_phase11c_reviews_media.sql` foi aplicada exclusivamente em `dyqqhhywiubjraxyebgr`. Substitui as policies amplas do bucket por INSERT temporário com tenant + escopo + permissão; DELETE temporário apenas de avatar autorizado. Sem UPDATE. Isso mantém o uploader da versão de Production anterior durante a validação do Preview. Objetos legados sob tenant/products continuam reconhecidos depois do contrato.

O contrato `20261023185520_phase11c_media_server_only.sql` deve remover `phase11c_legacy_insert` e `phase11c_legacy_avatar_delete` somente após Production READY e smoke dos três uploaders. Não executar db push indiscriminado antes dessa etapa. Após o contrato, abas antigas devem ser atualizadas; rollback para código anterior exige restaurar as policies estreitas da expansão, nunca as policies globais antigas. Leituras públicas de imagens permanecem intencionais.

## Verificação consolidada do Preview

- Node completo: 729/729 (incluindo os três testes HTTP de upload); focados 12/12.
- pgTAP: todos os 26 arquivos passaram; expansão 57/57 e contrato 7/7.
- Concorrência real: rotação invalida token em espera; dois envios simultâneos criam exatamente uma pending; fixture local removida.
- Typecheck/build sem erros; lint sem erros, 19 avisos preexistentes; diff check passou.
- Revisão independente final read-only em 8b39c35: 0 B/H/M e nenhum LOW novo; focados 12/12 repetidos pelo revisor.
- Next/eslint-config-next 15.5.28, Sharp 0.35.5 e parser CSS 7.1.6 corrigem advisories recém-publicados; npm sem vulnerabilidades.

Preview funcional aprovado; esta evidência ainda não declara PASS: contrato, merge e smoke de Production permanecem necessários.


## Ajustes encontrados no Preview

A branch recebeu `STORE_PREVIEW_CANONICAL_HOST=store.cibeleprint.com.br` somente no ambiente Preview para reutilizar o allowlist de host existente. O player YouTube exige identificação da origem: seu iframe usa `strict-origin-when-cross-origin`, que envia apenas a origem entre domínios. Formulário/token permanecem no-referrer. Referência oficial: https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity

## Evidência funcional no Preview

Formulário e Store verificados em 1440, 768 e 390 px; sem overflow da página no mobile. Galeria com três imagens e capa explícita, botões/teclado e drag-and-drop, remoção com Dialog/fallback, persistência e deduplicação: três objetos após reenvio. Submit com conta existente; pendente fora da Store; aprovar/publicar (5/5, 1 avaliação, J***), ocultar, restaurar, rejeitar, restaurar e aprovar novamente. Sete registros de histórico e seis Audit Logs de moderação preservam o comentário. Filtros status/nota/produto/período/verificada passaram. Sem movimentos financeiros nem alteração de paid_amount.

O player corrigido carregou o vídeo QA estável Big Buck Bunny, sem autoplay; clicar Assistir iniciou a reprodução e Voltar às imagens removeu o iframe. Os quatro novos eventos foram observados no analytics canônico, sem novo pipeline. Upload de banner testado em draft cancelado; avatar testado em perfil QA suspenso, sem auth_user_id e sem criação de usuário Auth. Os três consumidores usam o endpoint validado.

Fixture `qa-phase11c-product-20261023` e respectivo Order/review estão claramente QA, sem cobrança. Após o smoke de Production serão ocultados/cancelados e o perfil QA removido. Arquivos registrados seguem a política de retenção. Nenhuma mensagem foi enviada a clientes. Fase 11D permanece fora do escopo.
