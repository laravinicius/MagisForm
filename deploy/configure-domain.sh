#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Execute com sudo.'
host="${1:-}"; email="${2:-}"
[[ ${#host} -le 253 && $host =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || fail 'Uso: sudo magisform configure-domain <domínio> <e-mail>'
[[ $email =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail 'Informe um e-mail válido.'
install_dir=/srv/magisform-manager
source_dir=/opt/magisform/source
env_file="$install_dir/.env"
infra_compose="$source_dir/deploy/infrastructure/compose.yaml"
manager_compose="$source_dir/deploy/manager/compose.yaml"
[[ -s $env_file && -s $infra_compose ]] || fail 'A instalação MagisForm não foi encontrada.'
public_ip="$(curl -4 -fsSL --max-time 10 https://api.ipify.org)" || fail 'Não consegui consultar o IPv4 público da VM.'
getent ahostsv4 "$host" | awk '{print $1}' | sort -u | grep -Fxq "$public_ip" || fail "O DNS de $host não resolve para o IPv4 público $public_ip."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

backup="$env_file.configure-domain.bak"
[[ ! -e $backup ]] || fail "Já existe um backup operacional em $backup; revise antes de continuar."
cp -p "$env_file" "$backup"
completed=false
rollback() {
  if [[ $completed != true ]]; then
    cp -p "$backup" "$env_file"
    docker compose --env-file "$env_file" --file "$infra_compose" up -d >/dev/null 2>&1 || true
    docker compose --env-file "$env_file" --file "$manager_compose" up -d >/dev/null 2>&1 || true
    printf 'A alteração falhou; a configuração anterior foi restaurada. Confira o certificado e os logs antes de repetir.\n' >&2
  fi
}
trap rollback ERR INT TERM

set_env() {
  local key=$1 value=$2
  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

set_env MAGISFORM_HTTP_BIND_IP 0.0.0.0
set_env MAGISFORM_HTTPS_BIND_IP 0.0.0.0
set_env MAGISFORM_HTTP_PORT 80
set_env MAGISFORM_HTTPS_PORT 443
docker compose --env-file "$env_file" --file "$infra_compose" up -d
manager_image="$(sed -n 's/^MAGISFORM_MANAGER_IMAGE=//p' "$env_file")"
[[ $manager_image =~ ^magisform-manager:git-[a-f0-9]{7,40}$ ]] || fail 'Imagem local do painel ausente ou inválida.'
docker run --rm --network magisform_npm_control --volume "$install_dir/secrets:/state" \
  "$manager_image" node dist-server/manager/bootstrap-npm.js "$host" public "$email" >/dev/null

set_env MAGISFORM_MANAGER_ORIGIN "https://$host"
set_env MAGISFORM_MANAGER_PUBLIC_MODE true
set_env MAGISFORM_MANAGER_ALLOW_HOST_WITHOUT_PORT false
set_env MAGISFORM_MANAGER_CERTIFICATE_EMAIL "$email"
set_env MAGISFORM_MANAGER_ORIGIN_PORT_SUFFIX ''
docker compose --env-file "$env_file" --file "$manager_compose" up -d --force-recreate api agent
python3 - "$install_dir/install-manifest.json" "$host" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
manifest = json.loads(path.read_text())
manifest['mode'] = 'public'
manifest['managerHost'] = sys.argv[2]
path.write_text(json.dumps(manifest, indent=2) + '\n')
path.chmod(0o600)
PY
completed=true
rm -f "$backup"
trap - ERR INT TERM
printf 'Painel publicado: https://%s\n' "$host"
printf 'Verifique também o firewall do provedor para as portas TCP 80 e 443. O NPM administrativo continua em loopback.\n'
