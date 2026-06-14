# Regras Oficiais do PrintFlowPRO

1. Supabase é a fonte oficial de dados.
2. Não usar DUMMY_DATA em produção.
3. Não usar localStorage para clientes, produtos, categorias, pedidos, orçamentos, estoque ou financeiro.
4. localStorage só pode ser usado para tema, sidebar, preferências visuais e sessão temporária.
5. Admin e catálogo devem usar a mesma tabela products.
6. Categorias devem usar parent_id.
7. Produtos pertencem à subcategoria final.
8. Não recriar telas do zero sem autorização.
9. Não alterar nomes de tabelas existentes sem necessidade.
10. Cada correção deve ser pequena e testada antes de avançar.
