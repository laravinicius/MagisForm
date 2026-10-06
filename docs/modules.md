# Mapa de módulos

| Área | Localização | Responsabilidade | Verificar junto |
|---|---|---|---|
| Shell | `src/App.tsx`, `src/main.tsx` | Login, modo setup, abas, saída e composição | `AuthContext`, componentes, service |
| Fórmulas | `RecipeForm.tsx`, `FormulaList.tsx`, `Dashboard.tsx` | Criar, editar, confirmar, acompanhar e listar | `db.formulas`, clientes, insumos, schema |
| Cadastros | `CustomerManager.tsx`, `InsumoManager.tsx`, `SavedFormulaManager.tsx` | Clientes, insumos e modelos salvos | `useData`, `electron/db.ts`, tabelas |
| Administração | `UserManager.tsx`, `AdminUserManager.tsx`, `AuditLogs.tsx`, `SettingsManager.tsx` | Usuários, permissões, logs e conexão | autenticação, `action_logs`, config |
| Estado | `src/context/`, `src/hooks/useData.ts` | Sessão, rascunho, polling e refresh | `App.tsx`, `lanDatabase.ts` |
| Dados desktop | `electron/main.ts`, `preload.ts`, `db.ts` | IPC, queries, sessão, autorização e auditoria | `database.sql`, UI |

## Caminhos rápidos

- Tela ou fórmula: componente da tela → `lanDatabase.ts` → método em `electron/db.ts` → schema.
- Nova operação desktop: `main.ts`, `preload.ts` e `lanDatabase.ts`.
- Campo persistido: `src/types.ts`, `RecipeForm.tsx`, `db.ts` e `database.sql`.
- Login/permissões: [authentication.md](authentication.md), `AuthContext.tsx`, `main.ts` e `db.ts`.

O código permanece a fonte da verdade para detalhes de funções e payloads; esta página registra relações e pontos de investigação.
