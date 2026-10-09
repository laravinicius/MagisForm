# Banco de dados

MariaDB é acessado por `mysql2/promise` através de `Db` em `core/db.ts`. `database.sql` descreve o schema consolidado para instalação limpa e não cria usuário padrão.

O ADR-002 define o contrato operacional: bootstrap e upgrade explícitos (`npm run db:bootstrap`, `npm run db:preflight`, `npm run db:upgrade`), upgrades novos somente em `database/upgrades/`, e `migrations/` permanece histórico inerte. A conexão automática do aplicativo nunca executa DDL. Configure `MAGISFORM_DB_HOST`, `MAGISFORM_DB_PORT`, `MAGISFORM_DB_NAME`, `MAGISFORM_DB_USER` e `MAGISFORM_DB_PASSWORD` antes de invocar os comandos. Bootstrap só aceita banco vazio; upgrade exige backup e parada dos clientes.

Versão atual do schema: v2. O upgrade 001 amplia `users.password` para formatos codificados, invalida sessões existentes, adiciona política/expiração e impõe unicidade por usuário. O upgrade 002 adiciona `idx_formulas_created_id(created_at,id)` para a navegação estável e paginada de fórmulas; ele é idempotente e retomável. A etapa 05 usa Argon2id e transita SHA-256 legado após autenticação válida; o enforcement de expiração segue a política `desktop_local` ou `hosted`. Os metadados e checksums dos upgrades residem no próprio schema (`schema_version`, `schema_upgrade_history`). DDL parcial não tem rollback transacional garantido: em falha, mantenha manutenção, execute preflight e retome o upgrade idempotente ou restaure o backup ensaiado.

Para instalação nova, use um banco MariaDB vazio e execute `npm run db:bootstrap`. Para banco legado, execute `npm run db:preflight`, faça backup com restauração ensaiada, feche todos os clientes, então rode `npm run db:upgrade` e repita o preflight. Não aplique `database.sql` sobre banco existente.

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

Não copie credenciais, hashes ou valores de configuração sensíveis para documentação. Senhas legadas SHA-256 sem salt são migradas para Argon2id após autenticação bem-sucedida.
