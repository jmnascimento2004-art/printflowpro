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

## Verificação antes do Preview

- Node completo: 729/729 (incluindo os três testes HTTP de upload); focados 12/12.
- pgTAP: todos os 25 arquivos passaram; focado ampliado 57/57.
- Concorrência real: rotação invalida token em espera; dois envios simultâneos criam exatamente uma pending; fixture local removida.
- Typecheck/build sem erros; lint sem erros, 19 avisos preexistentes; diff check passou.
- Revisão independente read-only: 0 B/H/M nesta etapa; Preview e revisão final ainda pendentes.
- Next/eslint-config-next 15.5.28, Sharp 0.35.5 e parser CSS 7.1.6 corrigem advisories recém-publicados; npm sem vulnerabilidades.

Esta evidência ainda não declara PASS: Preview, contrato, merge e smoke de Production permanecem necessários.

