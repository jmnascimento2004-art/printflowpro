# Incidentes de Seguranca

## Procedimento minimo

1. Identificar o evento e sistemas afetados.
2. Conter o problema sem apagar evidencias.
3. Registrar data/hora, empresa, impacto provavel e acoes tomadas.
4. Avaliar se houve acesso, perda, alteracao, vazamento ou indisponibilidade de dados pessoais.
5. Notificar responsaveis internos da loja/plataforma.
6. Preservar logs proporcionais, sem copiar senhas, tokens, cartoes ou documentos completos.
7. Avaliar necessidade de comunicacao aos titulares e autoridades competentes com apoio juridico.
8. Corrigir causa raiz e registrar aprendizado.

## Eventos relevantes

- Criacao de conta.
- Aceite ou revogacao de consentimento.
- Alteracao de dados ou endereco.
- Solicitacao de exclusao.
- Alteracao de senha.
- Tentativas de acesso indevido bloqueadas.
- Falhas relevantes de autenticacao.

## Registro tecnico

Usar `privacy_audit_events` para eventos de privacidade do catalogo quando aplicavel. Logs tecnicos devem evitar dados sensiveis e preferir identificadores pseudonimizados.
