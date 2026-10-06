# Banco de dados

MariaDB é acessado por `mysql2/promise` através de `Db` em `electron/db.ts`. `database.sql` cria banco, tabelas, índices e seed usados pelo `docker-compose.yml`.

`migrations/` contém o histórico que originou o schema consolidado, mas não há executor no runtime ou nos scripts. O fluxo atual usa `database.sql`; não criar migrations novas sem uma decisão arquitetural explícita.

## Entidades

- `users`: usuários e roles `employee`, `pharmacist`, `manager` e `admin`, nessa ordem de acesso.
- `customers`: clientes, com telefone único.
- `insumos`: matérias-primas.
- `formulas`: cliente, orçamento, pagamento, entrega e status.
- `formula_items` e `formula_budget_items`: composição e opções de orçamento.
- `saved_formulas`, `saved_formula_items`, `saved_formula_budget_items`: modelos reutilizáveis.
- `sessions`: token e `last_seen`.
- `action_logs`: auditoria.

Fórmulas pertencem a clientes; seus itens referenciam insumos; modelos salvos também referenciam insumos. Itens dependentes usam cascata, enquanto insumos em uso são protegidos por `RESTRICT` e validação da aplicação.

Uma mudança de schema normalmente exige revisar `database.sql`, `src/types.ts`, queries/payloads em `db.ts`, bridge/service e endpoint web. Consulte `database.sql` para tipos e constraints, sem duplicá-lo aqui.

## Entrega efetiva e total mensal

`formulas.delivery_date` é a previsão preenchida no formulário. `formulas.delivered_at` registra automaticamente a entrega efetiva pelo backend como `DATETIME` no fuso `America/Sao_Paulo`. O histórico usa o mês e o ano de `delivered_at` para somar os orçamentos selecionados das fórmulas pagas e entregues. Edições e operações repetidas preservam essa data; sair do andamento `entregue` limpa o registro, e uma nova entrega registra uma nova data.

Fórmulas antigas sem `delivered_at` continuam no histórico, mas não entram no total mensal. Não há recuperação automática pelos logs nem uso da previsão como aproximação. Para um banco de teste já inicializado, adicionar a coluna com `ALTER TABLE formulas ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL COMMENT 'Entrega efetiva no fuso America/Sao_Paulo, registrada pelo backend';`. Antes da implantação em produção, validar a atualização do schema e definir o tratamento das entregas antigas, preservando os dados existentes.

> SECURITY: senhas atualmente usam SHA-256 sem salt. Não copie credenciais, hashes ou valores de configuração sensíveis para documentação.
