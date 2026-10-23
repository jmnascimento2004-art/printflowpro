# Fase 11D — NFS-e em mock seguro

## Escopo e decisão

O usuário escolheu NFS-e, Recife/PE e mock seguro de QA. Não há provider externo contratado/configurado nesta implementação. O adapter mock é integrado ao fluxo do ERP, mas não se comunica com prefeitura, SEFAZ ou API fiscal oficial. Nenhum arquivo ou estado simulado representa autorização fiscal real.

Produção fiscal permanece bloqueada independentemente de ambiente Vercel, credenciais futuras ou toggle legado. Infraestrutura publicada em Production não significa emissão fiscal em produção.

## Uso

- Configurações → Fiscal: inscrição municipal, município IBGE, CNAE, regime, série QA, natureza e código de serviço padrão. Nome, documento e endereço vêm do cadastro canônico da empresa. O município operacional atual não deve ser alterado automaticamente para Recife com base apenas na decisão do escopo.
- Cliente/Produto existente: seção Fiscal com salvamento separado; IBGE do cliente e código/CNAE do serviço respectivamente. Produto vazio herda defaults. Cliente incompleto continua podendo comprar normalmente.
- Financeiro → Fiscal ou Pedido → Fiscal: preparar solicitação, pré-validar, conferir resumo legível e confirmar somente QA.
- O mock aceita apenas Pedidos sintéticos na allowlist privada. Não existe ação de navegador para adicionar um Pedido real nessa lista.
- Após solicitação, o adapter devolve `processing`. “Consultar QA” recebe a confirmação simulada (`authorized_qa`). Rejeição é exercitada pelo contrato de teste do adapter e webhook verificado.
- Cancelamento requer admin/gerente com acesso financeiro, motivo de 15–250 caracteres e janela **exclusiva do mock** de 24 horas. Essa janela não é regra legal de NFS-e de Recife. Solicitação pendente pode ser retomada depois da janela, com o motivo já registrado.
- XML, PDF/DANFSe, chave de acesso oficial, CC-e e substituição não estão disponíveis no mock. Não foram fabricados documentos fiscais.

## Arquitetura e integridade

Migration `20261023232507_phase11d_fiscal_nfse_qa.sql`, aplicada de forma direcionada e aditiva, sem repair/reset/include-all. O arquivo foi renomeado para a versão efetivamente atribuída pelo MCP antes do commit; nenhuma edição de histórico remoto foi necessária.

Cinco tabelas públicas com RLS e leitura financeira tenant-scoped: configurações, complemento fiscal do cliente, complemento fiscal do produto, documentos e eventos. Duas tabelas privadas, sem acesso do navegador: allowlist QA e chave HMAC. Nenhum certificado ou senha é recebido ou persistido.

`fiscal_command` autentica usuário ativo, tenant e permissão, valida ambiente/provider, bloqueia produção e prepara snapshot a partir dos dados canônicos. Fingerprint SHA-256 exige que os dados confirmados ainda correspondam ao resumo pré-validado. O navegador envia IDs/fingerprint, nunca totais autoritativos. CPF/CNPJ têm verificação de dígitos, além de CEP/UF/IBGE e campos obrigatórios. A pré-validação de QA verifica dados e formato; não é homologação legal de código de serviço ou enquadramento tributário.

Lock do Pedido, idempotência por tenant/operação e unicidade parcial limitam a uma solicitação integral ativa por Pedido no mock. A relação histórica continua 1:N, inclusive após cancelamento/rejeição. Operações legais de fracionamento exigirão adapter e regras próprias, sem remover o histórico.

Snapshot e identidade fiscal são protegidos contra reescrita. Lista/número do Pedido/nome do cliente usam o snapshot histórico. Números são prefixados QA e não têm chave fiscal. Protocolos simulados de autorização/cancelamento ficam separados.

Adapter no servidor; callback HMAC-SHA256 com comparação constante, limite de cinco minutos e corpo limitado durante leitura. Processamento exige papel service_role, allowlist QA, lock do documento, sequência crescente e transição válida. Replay compara identidade completa e não duplica histórico. Eventos antigos não revertem autorização/cancelamento. Audit Log guarda somente referências/resumo; retorno externo nunca injeta JSON/erro cru.

Nenhuma rotina fiscal insere transação financeira, baixa recebível, modifica imposto gerencial, preço, Pedido, produção ou expedição. As permissões existentes de Financeiro continuam respeitando negações explícitas; configuração exige também Configurações e papel apropriado. Seções individuais consultam o cadastro exato e só habilitam edição depois de carregar o ID correto; Enter não submete o formulário principal.

## Validação e limites

39 cenários pgTAP focados na primeira bateria expandida: CPF/CNPJ, incompletude, RLS/permissões, bloqueio real, snapshot/fingerprint, idempotência, processing/autorização/rejeição QA, replay/ordem, cancelamento/rejeição/prazo/retry e preservação do Financeiro/Pedido. Testes Node do adapter verificam assinatura, spoof, replay temporal, estados inválidos e indisponibilidade de arquivos oficiais. Suítes completas e Preview/Production devem ser registrados no relatório final antes de PASS.

Advisors após expansão: nenhum novo FK fiscal sem índice ou search_path mutável. As duas RPCs autenticadas SECURITY DEFINER são intencionais, com autorização interna e search_path vazio; as duas tabelas privadas sem policy negam acesso por desenho. Avisos preexistentes de senha vazada desativada/search_path em funções antigas não foram alterados.

Antes de ativação real: decisão e contrato de provider, suporte efetivo ao município/modelo vigente, validação contábil dos cadastros e códigos, regime/alíquotas/retenções, certificado gerenciado quando necessário, credenciais secretas e homologação oficial ponta a ponta, arquivos oficiais, prazos/eventos legais, nova autorização explícita e implementação/revisão específica. Não basta ligar uma flag. A Fase 11E não é iniciada automaticamente.
