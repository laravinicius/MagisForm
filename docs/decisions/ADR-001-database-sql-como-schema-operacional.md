# ADR-001 — `database.sql` como schema operacional

## Contexto

O repositório possui migrations históricas e um schema consolidado. O Docker monta `database.sql` diretamente e não foi encontrado executor de migrations no runtime ou nos scripts.

## Decisão

`database.sql` é a fonte de verdade operacional para recriar e atualizar o schema. `migrations/` permanece como histórico.

## Motivo

Isso corresponde ao provisionamento real e evita migrations que nunca seriam aplicadas pelo projeto.

## Consequências

Mudanças de schema devem atualizar `database.sql` e revisar todos os consumidores. O histórico pode explicar decisões passadas, mas não é pipeline ativo.

## Status

Accepted
