# Registro de Proxy Host por farmácia

Repita uma entrada independente para cada instalação; não use curingas. A rede do NPM para essa instalação é exclusiva e não inclui MariaDB.

| Campo no NPM | Valor |
|---|---|
| Domain Names | `<alias DNS autorizado>` |
| Scheme | `http` |
| Forward Hostname / IP | `mf-<id>` (alias da instalação) |
| Forward Port | `3001` |
| Websockets Support | Ligado |
| Block Common Exploits | Ligado |
| SSL Certificate | Certificado próprio do alias |
| Force SSL | Ligado após certificado válido |
| HTTP/2 Support | Ligado |

Na aba **Advanced**, adicione `access_log off;` para impedir que query strings de busca apareçam nos access logs padrão do Nginx. O backend mantém logs sanitizados com `requestId`, instalação, rota e status.

Frontend e `/api/v1` são servidos pela aplicação no mesmo origin e pelo mesmo Proxy Host. Não cadastrar API separada. Em **SSL Certificates**, emitir/importar um certificado individual por hostname; DNS e autorização para ACME são pré-requisitos externos. Para QA, importar certificado de teste autossinado/local e confiar na CA apenas na máquina de ensaio. Nunca relatar esse certificado como emissão pública.

Conecte o container `magisform-npm` somente à rede `npm-<id>` depois de criá-la. Confira que o serviço `db` não está nessa rede. O acesso à UI administrativa usa túnel SSH até `127.0.0.1:81`; não publicar a porta 81 em endereço externo.

Após salvar cada host, confirme HTTP 301 para HTTPS, conteúdo da farmácia esperada no alias HTTPS, API da mesma origem e 404 para um Host não cadastrado. Hosts desconhecidos não podem cair em um Proxy Host padrão que direcione a uma farmácia.
Configure **Settings → Default Site → 404 Page** para HTTP e mantenha o vhost TLS default do Compose, que usa certificado autossinado de descarte e retorna HTTP 404 depois do handshake para SNI/Host desconhecidos.
