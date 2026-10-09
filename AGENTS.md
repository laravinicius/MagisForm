# MagisForm — Agent Instructions

Use este arquivo como mapa curto de navegação. Consulte os documentos vinculados somente quando a tarefa tocar aquela área; não faça uma varredura completa do repositório para uma mudança localizada quando o mapa for suficiente. Expanda a investigação se imports, rotas, schema ou evidências de runtime revelarem dependências não documentadas.

## Projeto e navegação

MagisForm é uma aplicação desktop Electron para fluxo de manipulação farmacêutica: Electron, React 19, Vite, TypeScript, Tailwind CSS v4 e MariaDB. O renderer nunca acessa MariaDB diretamente.

```text
electron/main.ts       → janela, IPC, configuração e eventos de mudança
electron/preload.ts    → bridge isolada do renderer
core/db.ts             → queries MariaDB, sessões, autorização e auditoria
src/App.tsx            → autenticação, navegação e composição
src/components/        → telas e módulos de negócio
src/services/lanDatabase.ts → facade tipada IPC/HTTP
src/hooks/useData.ts   → carregamento, polling e atualização
src/context/           → sessão e rascunho de fórmula
database.sql           → schema consolidado de instalação limpa
database/upgrades/     → upgrades versionados aplicados somente por comando explícito
docs/                  → mapas arquiteturais e decisões
```

Detalhes: [architecture.md](docs/architecture.md), [modules.md](docs/modules.md), [database.md](docs/database.md), [authentication.md](docs/authentication.md) e [decisions](docs/decisions/).

Interface e comentários novos devem permanecer em português brasileiro. Todos os dados fluem pelo MariaDB; não há cache local nem sincronização offline documentada.

---

## Architecture & Data Flow (Critical)

**Renderer never touches DB.** All data access requires three layers:
1. `electron/main.ts` — IPC handlers (`ipcMain.handle`)
2. `electron/preload.ts` — bridge exposed as `window.electronAPI`
3. `src/services/lanDatabase.ts` — typed client (`db.*`) + `Window.electronAPI` types

**Mutations** → `main.ts` emits `data:changed` to all windows; `useData` hook also polls every 10s.

**Path alias**: `@/*` resolves to repo **root**, not `src/`.

---

## Database Schema

- `database.sql` = schema consolidado atual para bootstrap limpo. **Sempre atualize-o.**
- Upgrades novos e versionados ficam exclusivamente em `database/upgrades/`; `migrations/` é histórico e nunca deve ser executado pelo bootstrap, upgrade ou runtime.
- Bootstrap e upgrade são comandos explícitos. É proibido executar DDL automaticamente ao abrir a janela, conectar o pool ou atender requests.
- Comandos operacionais: `npm run db:bootstrap`, `npm run db:preflight` e `npm run db:upgrade`; consulte `docs/database.md` e ADR-002.
- Upgrade exige preflight estrutural, versão/checksum e lock exclusivo; schema desconhecido deve falhar sem alteração. Mudanças DDL devem permitir retomada ou exigir restore ensaiado.
- Não incluir senha administrativa padrão em `database.sql`; criação do primeiro administrador pertence ao provisionamento explícito.
- Coluna `users.password` comporta hash codificado. A transição de SHA-256 legado e o rehash ficam sujeitos à compatibilidade de release registrada na etapa correspondente.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite on port 3000 bound to `0.0.0.0` (for Electron) |
| `npm run build` | Vite/Electron build and local Windows `dir` + NSIS packaging; does not publish |
| `npm run lint` | `tsc --noEmit` (only verification; no test framework) |
| `npm run clean` | Remove `dist/`, `dist-electron/`, `release/` e `../magisform-release/` |

---

## Key Implementation Details

- **Session**: Single active session/user. Electron heartbeat every 30s, local idle TTL 120s and absolute TTL 30 days; hosted policy uses 15min idle and 12h absolute. Cleanup runs every 60s.
- **Force login**: Returns `conflict: true` if logged in elsewhere; pass `force: true` to override.
- **Setup mode**: o login especial de configuração retorna `setupMode: true` e mostra apenas Settings. Não copie credenciais para documentação; consulte o código quando esse fluxo precisar mudar.
- **Exit confirmation**: Blocks close/logout until modal confirmed (`app:confirm-exit` / `app:exit-confirmed`).

---

## Conventions

- UI strings and new comments: **Brazilian Portuguese**.
- Never commit: `dist/`, `dist-electron/`, `release/`, `../magisform-release/`, `att.txt`, `db.txt`.

---

## Identidade visual

A identidade segue `website/brand/GUIDE.md`. A fonte de cores do aplicativo é `config/branding.ts`; `applyBrandTheme()` disponibiliza os mesmos tokens ao CSS. Os estilos de apresentação compartilhados estão em `src/index.css`.

- Verde: `#173E35`; fundo: `#F4F1E9`; superfície creme: `#FFFDF8`.
- Coral: `#D95C4F`, com texto `#101814`; apoio sálvia: `#DCE8E1`.
- Texto: `#17201D`; secundário: `#5F6965`; bordas: `#DCDDD4`.
- Títulos principais: Vollkorn; controles, tabelas e corpo: Atkinson Hyperlegible Next. Fontes e licenças locais em `public/fonts/`.
- Logos vetoriais aprovados em `public/brand/`; branco sobre verde e verde sobre superfícies claras, sem distorções, sombras ou gradientes.
- Use tokens semânticos de sucesso, atenção e erro; coral não representa erro por padrão.
- Use classes semânticas (`ui-panel`, `ui-field`, `ui-button-primary`, `ui-button-secondary`, `ui-dialog`) e utilitários do tema. Não sobrescreva classes Tailwind globais nem introduza cores avulsas por tela.
- Preserve escala de fonte, menus, campos, permissões, fluxo de dados e rolagem horizontal necessária a tabelas.

---

## Adding a Data Feature (Checklist)

1. Update `database.sql` if schema changes
2. Add IPC handler in `electron/main.ts`
3. Expose in `electron/preload.ts`
4. Add typed method in `src/services/lanDatabase.ts`
5. Use `db.*` in React components via `useData` hook

## Fluxo para novas tarefas

1. Identifique a área em `docs/modules.md`.
2. Consulte o documento de arquitetura, banco ou autenticação correspondente.
3. Inspecione somente os entrypoints e dependências indicados.
4. Faça a menor alteração consistente; novo acesso a dados segue a cadeia IPC → preload → service.
5. Execute `npm run lint` e, quando bundling/empacotamento for afetado, `npm run build`.
6. Atualize a documentação somente se uma fronteira arquitetural ou decisão mudar.
