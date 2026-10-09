# MagisForm

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![Node](https://img.shields.io/badge/Node-20%2B-green)
![Electron](https://img.shields.io/badge/Electron-36-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-6-646cff)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![MariaDB](https://img.shields.io/badge/MariaDB-11-0064a5)
![License](https://img.shields.io/badge/License-MIT-yellow)

Aplicação desktop online-first para gerenciamento do fluxo de manipulação farmacêutica. Usa Electron, React 19, Vite, TypeScript, Tailwind CSS v4 e MariaDB. Não há cache local nem sincronização offline documentada.

O produto e o aplicativo usam a marca **MagisForm**.

## Visão geral

![Prévia do sistema MagisForm com a lista de fórmulas em produção](website/assets/images/formulas-1600.webp)

## Funcionalidades

| Módulo | Descrição |
|---|---|
| Dashboard | Estatísticas de fórmulas, clientes e insumos e ações rápidas. |
| Nova Fórmula | Cliente, atendente, orçamento, insumos, quantidades, unidades, entrega e pagamento. |
| Pendentes | Fórmulas `pending`, aguardando confirmação e validação dos campos obrigatórios. |
| Confirmadas | Fórmulas `confirmed`/`completed`, com andamento `em_producao`, `aguardando_retirada`, `aguardando_envio` ou `entregue`. |
| Histórico | Fórmulas `cancelled`/`delivered`, filtros, visualização e repetição. |
| Clientes | Cadastro, edição, busca e paginação; telefone único. |
| Insumos | Cadastro e edição de matérias-primas; nome único. |
| Minhas Fórmulas | Modelos reutilizáveis com insumos e itens de orçamento. |
| Administração | Usuários `admin`/`employee`, administradores, troca de senha e exclusões protegidas. |
| Logs de auditoria | Consulta de ações registradas em `action_logs`. |
| Configurações | Conexão MariaDB salva em `userData/config.json` e teste de conexão. |
| WhatsApp | Abertura de links `whatsapp://send`. |

A entrega só pode avançar quando o pagamento estiver marcado como pago, conforme as regras do backend.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Electron 36.x |
| Frontend | React 19.x |
| Build | Vite 6.x + `vite-plugin-electron` |
| Estilos | Tailwind CSS 4.x via `@tailwindcss/vite` |
| Linguagem | TypeScript 5.8.x |
| Banco | MariaDB 11 no Docker; MariaDB/MySQL configurável |
| Driver | `mysql2` 3.18.x |
| Animações | `motion` 12.x |
| Ícones | `lucide-react` 0.546.x |
| Empacotamento | `electron-builder` 25.x |
| Verificação | `tsc --noEmit` |

## Arquitetura

O renderer não acessa o banco diretamente:

```text
React
  ↓ src/services/lanDatabase.ts
preload.ts / contextBridge
  ↓ IPC
electron/main.ts / ipcMain.handle
  ↓
core/db.ts / mysql2
  ↓
MariaDB
```

- `main.ts`: janela, handlers IPC, configuração, saída e notificações.
- `preload.ts`: API isolada `window.electronAPI`.
- `db.ts`: queries, autenticação, autorização, sessões e auditoria.
- `lanDatabase.ts`: fachada tipada do renderer.
- `useData.ts`: evento `data:changed` e polling a cada 10 segundos.
- A fachada também possui caminho compatível com execução web via `fetch` para endpoints `/api`, quando disponível.
- O alias `@/*` resolve para a raiz do repositório, não para `src/`.

## Banco de dados

`database.sql` é a fonte operacional única. O Docker o monta na inicialização. `migrations/` é somente histórico; não há executor de migrations no runtime ou nos scripts.

Tabelas principais:

```text
users, customers, insumos, formulas
formula_items, formula_budget_items
saved_formulas, saved_formula_items, saved_formula_budget_items
budget_number_registry, sessions, action_logs
```

Senhas são armazenadas atualmente como SHA-256 hexadecimal. O seed de `database.sql` cria:

- usuário: `administrador`
- senha: definida pelo hash existente no próprio `database.sql`
- papel: `admin`

O modo especial de configuração usa `admin` / `admin123`; essas credenciais não são o usuário seed e servem apenas para acessar Configurações.

## Autenticação e sessões

- Papéis: `admin` e `employee`.
- Token mantido em memória no renderer, sem persistência local.
- Heartbeat do cliente a cada 2 segundos.
- TTL de sessão: 120 segundos sem heartbeat.
- Limpeza de sessões órfãs a cada 60 segundos no processo principal.
- Uma sessão ativa por usuário; login forçado substitui a anterior.
- Logout após 5 minutos sem mouse, teclado, clique ou toque.
- Operações administrativas também são verificadas no backend.

## Primeira execução

1. Inicie MariaDB ou use o Docker Compose.
2. Execute `npm install`.
3. Execute `npm run dev`.
4. Para configurar a conexão, use `admin` / `admin123`.
5. Preencha e teste host, porta, usuário, senha e banco em Configurações.
6. Reinicie e entre com `administrador` ou outro usuário existente; novos usuários podem ser criados em Administração.

## Banco local com Docker

O Compose usa MariaDB 11, expõe `3306`, executa `database.sql` na primeira inicialização e persiste dados em volume nomeado.

```bash
docker compose up -d
docker compose ps
docker compose logs -f mariadb
```

Credenciais de desenvolvimento: banco `magisform`, usuário `magisform_app`, senha `magisform_dev`, root `magisform_root_dev`.

Para recriar o banco, removendo os dados persistidos:

```bash
docker compose down -v
docker compose up -d
```

## Comandos

| Comando | Descrição |
|---|---|
| `npm install` | Instala dependências. |
| `npm run dev` | Inicia Vite em `0.0.0.0:3000` com o plugin Electron em desenvolvimento. |
| `npm run build` | Executa patch do ícone, build Vite e `electron-builder --win`. |
| `npm run preview` | Preview do build Vite, sem Electron. |
| `npm run lint` | `tsc --noEmit`; não há suíte de testes configurada. |
| `npm run clean` | Remove `dist/`, `dist-electron/`, `release/` e `../magisform-release/`. |

## Build para Windows

```bash
npm run build
```

Os targets configurados são `dir` e `nsis`. O destino é:

```text
../magisform-release/<versão>/
```

`dir` gera uma versão descompactada; `nsis` gera o instalador quando os binários necessários estiverem disponíveis.

## Estrutura

```text
magisform/
├── electron/
│   ├── main.ts, preload.ts
├── core/
│   ├── db.ts, dbError.ts, deliveryTime.ts
├── src/
│   ├── components/          # telas e módulos de negócio
│   │   ├── AdminUserManager.tsx, AuditLogs.tsx
│   │   ├── Dashboard.tsx, FormulaList.tsx, RecipeForm.tsx
│   │   └── SettingsManager.tsx e demais componentes
│   ├── context/             # AuthContext e FormDraftContext
│   ├── hooks/useData.ts
│   ├── services/lanDatabase.ts
│   ├── types.ts, App.tsx, index.css
│   └── utils/                # formatação, navegação e performance
├── config/branding.ts
├── database.sql
├── docker-compose.yml
├── public/, scripts/, docs/
├── package.json
└── README.md
```

## Convenções

- Interface e comentários novos em português brasileiro.
- Novo acesso a dados segue `main.ts` → `preload.ts` → `lanDatabase.ts` → banco.
- Mudanças de schema atualizam `database.sql`; não criar migrations sem decisão arquitetural.
- Mutações preservam auditoria e `data:changed`.
- Cores de marca: vermelho `#C5243E`, azul `#243465` e azul claro `#4A90D9`; não usar `red-500`/`blue-500` como substitutos.
- Capturas de tela podem ser colocadas em `docs/screenshots/` (recomendado: 1280x800, PNG/WebP).

## Licença e autor

Este projeto está sob a [licença MIT](LICENSE).

**Vinicius Lara** — [GitHub](https://github.com/ViniciusLara) · [LinkedIn](https://linkedin.com/in/viniciuslara)

Dependências principais: [Electron](https://www.electronjs.org/), [Vite](https://vitejs.dev/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [MariaDB](https://mariadb.org/), [lucide-react](https://lucide.dev/) e [Motion](https://motion.dev/). A lista completa está em [package.json](package.json).

