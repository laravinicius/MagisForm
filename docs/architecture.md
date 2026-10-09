# Arquitetura

## Visão geral

MagisForm é uma aplicação desktop Electron/React conectada online a MariaDB. Não há cache local ou sincronização offline documentada.

```text
React (src/) → lanDatabase.ts
    ├─ Electron → preload.ts → IPC → electron/main.ts
                              └→ core/db.ts → MariaDB
```

`main.ts` cria a janela, registra IPC, persiste a configuração desktop e emite `data:changed` após mutações.

## Entry points

- `src/main.tsx`: montagem React.
- `src/App.tsx`: autenticação, navegação, modo configuração e telas.
- `electron/main.ts`: processo principal e handlers IPC.
- `core/`: Db, consultas/regras de persistência e helpers de erro/data, sem dependência de Electron ou browser.
- `electron/preload.ts`: bridge com `contextIsolation` e sem `nodeIntegration`.
- `database.sql`: schema usado pelo Docker e referência operacional.

`useData` compartilha carregamentos, escuta `data:changed` no Electron e faz polling a cada 10 segundos. O build/lint está em `package.json`; não há suíte de testes configurada.

## Limites

- O renderer não importa `mysql2` ou `core/`; o Electron main injeta o pool no núcleo compartilhável.
- Novo acesso de dados no Electron atravessa `main.ts` → `preload.ts` → `lanDatabase.ts`.
- Alterações de schema atualizam `database.sql`; as migrations existentes são históricas.
- O nome interno e a marca do aplicativo são `MagisForm`; a configuração desktop fica em `%APPDATA%/MagisForm/config.json`, com `userData` e `sessionData` apontando para essa pasta. Logos e ícone usam a identidade vetorial de `website/assets/brand/`, copiada para `public/brand/`.
- Mutations preservam auditoria e a notificação `data:changed`.
- A apresentação usa tokens de `config/branding.ts`, estilos compartilhados em `src/index.css` e fontes locais. Detalhes: [identidade visual](visual-identity.md).

> UNKNOWN: não foi encontrado CI/CD ou teste automatizado no repositório.
