# Autenticação e autorização

## Electron local

`AuthContext` mantém usuário e token em memória no renderer. O login acontece por IPC. O processo principal guarda a sessão associada ao `webContents` que autenticou; os canais de dados não aceitam identidade ou modo setup vindos do payload para estabelecer autorização. `Db.withSessionContext()` valida a sessão e associa o ator durante a operação. O núcleo exige esse contexto em queries e escritas; operações sem sessão são recusadas antes de chegar à lógica de negócio.

As assinaturas públicas de `preload` e `src/services/lanDatabase.ts` permanecem compatíveis com o desktop atual. O main injeta o contexto por janela para leituras que historicamente não recebiam token e para mutações, sem confiar nos tokens opcionais passados pelo renderer para decidir o ator. Fechar a janela remove a associação em memória. Login/force/logout continuam usando os canais de autenticação próprios.

## Senhas e sessão

Senhas novas usam Argon2id com 19 MiB, 2 iterações e paralelismo 1. Hashes SHA-256 legados são verificados com comparação de tempo constante e atualizados para Argon2id no login bem-sucedido. Reautenticação administrativa também aceita o hash legado e faz a transição; hashes nunca entram nos DTOs de usuário.

O modo `desktop_local` usa 120 segundos de inatividade e limite absoluto de 30 dias. O modo `hosted` usa 8 horas de inatividade e validade absoluta de 24 horas, configuráveis no servidor dentro desses limites. Rotas de negócio renovam a inatividade somente quando recebem `X-Magisform-Activity: user`; polling passivo, `/auth/me` e `/auth/heartbeat` não renovam. A limpeza considera a política da própria linha. Há unicidade de sessão por usuário. Login concorrente serializa na linha de `users`; sem `force`, a segunda autenticação recebe conflito. Com `force`, a sessão anterior é revogada e a saída forçada é auditada na mesma transação do novo login.

Logout revoga a sessão e grava auditoria na mesma transação. Sessões sem os campos de expiração não são aceitas; etapa 04 invalida sessões legadas durante o upgrade.

## HTTP hospedado

O servidor Fastify expõe a API versionada em `/api/v1`. Web usa o cookie host-only `__Host-magisform_session` (HttpOnly, Secure, Path=/, SameSite=Lax, sem Domain) e token CSRF com validação de Origin canônico em operações mutantes. Desenvolvimento usa nomes distintos de cookie e só deve escutar em loopback. Electron remoto autentica em `/auth/desktop/login` e envia Bearer; o token aparece somente nessa resposta para ser guardado pelo processo main, não no login web nem nos DTOs de sessão.

Tokens são aleatórios e o MariaDB armazena somente SHA-256 do token. Requests não podem combinar cookie e Bearer. O servidor não habilita CORS; production exige origin HTTPS e Host canônico. `MAGISFORM_SERVER_TRUST_PROXY` aceita apenas uma lista explícita de IPs confiáveis; vazio não confia em headers encaminhados. O rate limit de login é por IP e nome da conta no processo da instalação.

O servidor não oferece endpoints de setup, bootstrap ou acesso ao MariaDB. `/health/live` verifica o processo; `/health/ready` verifica conexão e versão de schema sem devolver detalhes. A configuração pública tem somente nome, marca, versão e capacidades aprovadas.

No browser, a facade faz requests de mesma origem com `credentials: 'same-origin'`. O cookie de sessão nunca é lido por JavaScript; o token CSRF fica somente em memória e é enviado no header das mutações. Antes de mostrar conteúdo protegido, a aplicação restaura o usuário por `/auth/me`. Uma resposta 401 em rota autenticada limpa recursos e rascunhos em memória e retorna ao login; falha de rede/503 mantém a sessão apresentada e não é tratada como senha inválida. Login concorrente preserva o conflito explícito e o usuário pode confirmar o login forçado.

As leituras iniciadas por navegação enviam `X-Magisform-Activity: user`; polling de 10 segundos, `/auth/me` e heartbeat usam `passive` e não renovam indefinidamente a validade por inatividade. As chaves de `useData` incluem origem, sessão e recurso. Logout, novo login e sessão revogada trocam esse escopo e descartam os recursos antigos. O cache e os rascunhos continuam somente em memória do renderer.

## Perfis e permissões

Roles: `employee`, `pharmacist`, `manager` e `admin`. Todas as operações de negócio exigem sessão. Leituras de pacientes/clientes, insumos e fórmulas aceitam qualquer usuário autenticado. Administração de usuários, auditoria e modelos salvos é restrita a `admin`, `manager` e `pharmacist`. As demais ações preservam a matriz da etapa 00. Verificação de fórmula é exclusiva do perfil `manager`, sem equivalência para os outros perfis privilegiados.

Operações de exclusão/alteração administrativa mantêm a reautenticação de credenciais já existente e usam como ator o usuário da sessão IPC validada. Autoexclusão e remoção/rebaixamento do último acesso administrativo utilizável são bloqueados.

## Modo de configuração

O modo especial de setup continua local ao Electron e ligado ao `webContents` que autenticou por esse fluxo. O main só permite os canais de provisionamento de usuário que já existiam; nenhuma flag ou payload renderer pode adquirir o contexto. O modo não pode ler clientes, insumos, fórmulas, modelos ou auditoria. Configuração da conexão também pode ser acessada por sessão privilegiada; os canais são locais ao Electron e não são publicados por HTTP.

## Capacidades da plataforma

O browser mantém navegação em estado React, reaplica o mesmo conjunto de telas e permissões e restaura a sessão por cookie após reload. A barra de janela, updater, configuração MariaDB e setup ficam exclusivos do Electron; o logout web mantém a confirmação existente e o fechamento de aba usa apenas `beforeunload` quando há rascunho alterado. Links de WhatsApp usam nova aba com `noopener,noreferrer`. O backend serve o bundle web quando `dist-web/` está presente e mantém `/api/v1` na mesma origem.

O modo Electron remoto, proxy/produção, implantação e a matriz operacional integrada continuam nas etapas seguintes. O setup remoto não existe.
