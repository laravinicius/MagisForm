#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly REPOSITORY="https://github.com/laravinicius/magisform.git"
readonly SOURCE_DIR="/opt/magisform/source"
readonly INSTALL_DIR="/srv/magisform-manager"
readonly STATE_DIR="$INSTALL_DIR/secrets"
readonly MANAGER_COMPOSE="$SOURCE_DIR/deploy/manager/compose.yaml"
readonly INFRA_COMPOSE="$SOURCE_DIR/deploy/infrastructure/compose.yaml"
readonly NPM_IMAGE="jc21/nginx-proxy-manager:2.16.0"

fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }
ask() { local answer; read -r -p "$1" answer <&3; printf '%s' "$answer"; }

[[ $EUID -eq 0 ]] || fail 'Execute o instalador com sudo.'
[[ -e /dev/tty ]] || fail 'A instalação precisa de um terminal interativo.'
exec 3<>/dev/tty
[[ -r /etc/os-release ]] || fail 'Não foi possível identificar o sistema operacional.'
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail 'Este instalador suporta Ubuntu Server 24.04 LTS.'
[[ $(dpkg --print-architecture) == amd64 ]] || fail 'A primeira versão suporta somente Ubuntu amd64.'

printf 'Instalação MagisForm em %s\n' "$(hostname -f 2>/dev/null || hostname)"
printf '1) Teste local sem DNS (acesso por túnel SSH e certificado de teste)\n'
printf '2) Publicar agora com domínio e certificado HTTPS\n'
mode="$(ask 'Escolha [1/2] (padrão 1): ')"; mode=${mode:-1}
[[ $mode == 1 || $mode == 2 ]] || fail 'Escolha 1 ou 2.'
if [[ $mode == 1 ]]; then
  install_mode=local
  manager_host="$(ask 'Domínio de teste do painel [gestao.magisform.test]: ')"; manager_host=${manager_host:-gestao.magisform.test}
  [[ $manager_host =~ ^[a-z0-9.-]+\.magisform\.test$ && $manager_host != magisform.test ]] || fail 'Use um hostname sob magisform.test, por exemplo gestao.magisform.test.'
  certificate_email=''
  bind_ip=127.0.0.1; http_port=8080; https_port=8443; origin_port_suffix=':8443'
else
  install_mode=public
  manager_host="$(ask 'Domínio do painel (DNS A já deve apontar para esta VM): ')"
  [[ ${#manager_host} -le 253 && $manager_host =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || fail 'Informe um domínio DNS válido.'
  certificate_email="$(ask 'E-mail para avisos do certificado: ')"
  [[ $certificate_email =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail 'Informe um e-mail válido.'
  bind_ip=0.0.0.0; http_port=80; https_port=443; origin_port_suffix=''
fi
operator="$(ask 'Usuário do operador do painel: ')"
[[ $operator =~ ^[A-Za-z0-9._-]{2,100}$ ]] || fail 'Usuário inválido (use 2–100 letras, números, ponto, hífen ou sublinhado).'

if [[ $install_mode == public ]]; then
  log 'Validando DNS público e conectividade necessária para HTTPS'
  public_ip="$(curl -4 -fsSL --max-time 10 https://api.ipify.org)" || fail 'Não consegui consultar o IPv4 público da VM.'
  if ! getent ahostsv4 "$manager_host" | awk '{print $1}' | sort -u | grep -Fxq "$public_ip"; then
    fail "O DNS de $manager_host não resolve para o IPv4 público detectado ($public_ip). Nenhuma instalação foi iniciada."
  fi
  printf 'Confirme no firewall da VM/provedor as portas TCP 80 e 443; a porta 81 do NPM ficará restrita a loopback.\n'
fi

log 'Instalando dependências e Docker Engine com Compose'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg openssl python3
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker info >/dev/null || fail 'O serviço Docker não respondeu.'

log 'Obtendo a branch main do repositório'
install -d -m 0755 "$(dirname "$SOURCE_DIR")"
if [[ -d "$SOURCE_DIR/.git" ]]; then
  [[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || fail "O checkout $SOURCE_DIR contém alterações locais; preserve-as e revise manualmente."
  git -C "$SOURCE_DIR" fetch --depth 1 origin main
  git -C "$SOURCE_DIR" checkout --detach FETCH_HEAD
elif [[ ! -e "$SOURCE_DIR" ]]; then
  git clone --depth 1 --branch main "$REPOSITORY" "$SOURCE_DIR"
else
  fail "$SOURCE_DIR existe, mas não é um checkout Git gerenciado pelo instalador."
fi
commit="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
short_commit="${commit:0:12}"
app_image="magisform:git-$short_commit"
manager_image="magisform-manager:git-$short_commit"

log 'Construindo localmente as imagens do MagisForm e do painel'
docker build --pull -f "$SOURCE_DIR/Dockerfile" -t "$app_image" "$SOURCE_DIR"
docker build --pull -f "$SOURCE_DIR/Dockerfile.manager" -t "$manager_image" "$SOURCE_DIR"
image_id="$(docker image inspect --format '{{.Id}}' "$app_image")"
[[ $image_id =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'O ID da imagem construída não é válido.'

log 'Preparando diretórios persistentes e rede de entrada do NPM'
install -d -m 0700 "$INSTALL_DIR" "$STATE_DIR"
chown -R 1000:1000 "$INSTALL_DIR"
chmod 0700 "$STATE_DIR"
if ! docker network inspect npm-management >/dev/null 2>&1; then
  docker network create --driver bridge --label com.magisform.network=manager-edge npm-management >/dev/null
else
  edge_label="$(docker network inspect --format '{{index .Labels "com.magisform.network"}}' npm-management)"
  [[ $edge_label == manager-edge ]] || fail 'A rede npm-management já existe e não foi criada pelo MagisForm; revise-a manualmente.'
fi
trust_proxy="$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' npm-management)"
[[ $trust_proxy =~ ^[0-9./]+$ ]] || fail 'Não consegui determinar a sub-rede Docker do NPM.'

if [[ -f "$STATE_DIR/operator.json" || -f "$STATE_DIR/agent-token.txt" ]]; then
  [[ -f "$STATE_DIR/operator.json" && -f "$STATE_DIR/agent-token.txt" ]] || fail 'Estado do operador incompleto; nenhuma conta foi substituída.'
  operator_created=false
else
  operator_created=true
fi

cat > "$INSTALL_DIR/.env" <<EOF
MAGISFORM_MANAGER_IMAGE=$manager_image
MAGISFORM_MANAGER_ORIGIN=https://$manager_host$origin_port_suffix
MAGISFORM_MANAGER_TRUST_PROXY=$trust_proxy
MAGISFORM_MANAGER_APPROVED_IMAGES=$app_image
MAGISFORM_MANAGER_EXPECTED_IMAGE_ID=$image_id
MAGISFORM_MANAGER_PUBLIC_MODE=$([[ $install_mode == public ]] && printf true || printf false)
MAGISFORM_MANAGER_ALLOW_HOST_WITHOUT_PORT=$([[ $install_mode == local ]] && printf true || printf false)
MAGISFORM_MANAGER_CERTIFICATE_EMAIL=$certificate_email
MAGISFORM_MANAGER_TEST_DOMAIN_SUFFIX=.magisform.test
MAGISFORM_MANAGER_ORIGIN_PORT_SUFFIX=$origin_port_suffix
MAGISFORM_MANAGER_STATE_DIR=$STATE_DIR
MAGISFORM_MANAGER_ROOT=$INSTALL_DIR
MAGISFORM_MANAGER_EDGE_NETWORK=npm-management
DOCKER_SOCKET_GID=$(stat -c '%g' /var/run/docker.sock)
MAGISFORM_HTTP_BIND_IP=$bind_ip
MAGISFORM_HTTPS_BIND_IP=$bind_ip
MAGISFORM_HTTP_PORT=$http_port
MAGISFORM_HTTPS_PORT=$https_port
EOF
chmod 0600 "$INSTALL_DIR/.env"
cat > "$INSTALL_DIR/install-manifest.json" <<EOF
{"repository":"$REPOSITORY","branch":"main","commit":"$commit","managerImage":"$manager_image","appImage":"$app_image","appImageId":"$image_id","npmImage":"$NPM_IMAGE","mode":"$install_mode","managerHost":"$manager_host"}
EOF
chmod 0600 "$INSTALL_DIR/install-manifest.json"

log 'Subindo Nginx Proxy Manager'
docker pull "$NPM_IMAGE"
docker compose --env-file "$INSTALL_DIR/.env" --file "$INFRA_COMPOSE" up -d
for attempt in $(seq 1 90); do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' magisform-npm 2>/dev/null || true)"
  [[ $state == healthy ]] && break
  sleep 2
done
[[ ${state:-} == healthy ]] || fail 'Nginx Proxy Manager não ficou saudável; volumes e configurações foram preservados.'

log 'Configurando credenciais protegidas, certificado e Proxy Host do painel'
docker run --rm --network magisform_npm_control --volume "$STATE_DIR:/state" \
  "$manager_image" node dist-server/manager/bootstrap-npm.js "$manager_host" "$install_mode" "$certificate_email" >/dev/null
chmod 0600 "$STATE_DIR/npm-credentials.json"

if [[ $operator_created == true ]]; then
  log 'Criando operador inicial; guarde agora a senha e o segredo TOTP exibidos'
  credentials="$(docker run --rm --user 1000:1000 --volume "$STATE_DIR:/state" -e MAGISFORM_MANAGER_STATE=/state \
    "$manager_image" node scripts/manager-setup.mjs "$operator")"
  printf '\n%s\n' "$credentials"
else
  log 'Conta do operador já existe; preservada sem reexibir credenciais.'
fi

log 'Subindo API do painel e executor restrito'
docker compose --env-file "$INSTALL_DIR/.env" --file "$MANAGER_COMPOSE" up -d
docker compose --env-file "$INSTALL_DIR/.env" --file "$MANAGER_COMPOSE" ps

cat > /usr/local/bin/magisform <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
case "${1:-}" in
  configure-domain)
    shift
    exec bash /opt/magisform/source/deploy/configure-domain.sh "$@"
    ;;
  status)
    docker compose --env-file /srv/magisform-manager/.env --file /opt/magisform/source/deploy/infrastructure/compose.yaml ps
    docker compose --env-file /srv/magisform-manager/.env --file /opt/magisform/source/deploy/manager/compose.yaml ps
    ;;
  npm-credentials)
    cat /srv/magisform-manager/secrets/npm-credentials.json
    ;;
  *)
    echo 'Uso: sudo magisform status | npm-credentials | configure-domain <domínio> <e-mail>' >&2
    exit 2
    ;;
esac
EOF
chmod 0755 /usr/local/bin/magisform

log 'Instalação concluída'
if [[ $install_mode == local ]]; then
  printf 'Painel: https://%s:8443 (certificado de teste; o navegador avisará que não é público).\n' "$manager_host"
  printf 'No seu computador, crie um túnel: ssh -L 8443:127.0.0.1:8443 -L 81:127.0.0.1:81 USUARIO_SSH@IP_DA_VM\n'
  printf 'No arquivo hosts do computador, adicione: 127.0.0.1 %s\n' "$manager_host"
  printf 'Para cada farmácia, adicione também: 127.0.0.1 NOME.magisform.test (substitua NOME pelo domínio exibido no painel).\n'
  printf 'Para publicar depois: sudo magisform configure-domain painel.exemplo.com.br operador@exemplo.com\n'
else
  printf 'Painel: https://%s\n' "$manager_host"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ssh_port="${SSH_CONNECTION:-}"; ssh_port="${ssh_port##* }"; [[ $ssh_port =~ ^[0-9]+$ ]] || ssh_port=22
    ufw allow "$ssh_port/tcp" >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
  else
    printf 'Confirme no firewall do provedor as portas TCP 80 e 443; a porta 81 segue em loopback.\n'
  fi
fi
printf 'Manifesto e estado persistente: %s\n' "$INSTALL_DIR"
printf 'O executor Docker é o único serviço do painel com acesso ao socket Docker.\n'
