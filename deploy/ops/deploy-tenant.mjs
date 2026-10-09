import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const [id, image, flag] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{1,30}$/.test(id ?? '') || !/@sha256:[a-f0-9]{64}$/.test(image ?? '') || !['--preflight', '--apply'].includes(flag)) throw new Error('Uso: node deploy/ops/deploy-tenant.mjs <id> <repo@sha256:digest> --preflight|--apply');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'deploy/tenants/catalog.json'), 'utf8'));
if (!catalog[id] || catalog[id].status !== 'provisioned') throw new Error('Instalação ausente ou não provisionada.');
const dir = path.join(root, 'deploy/tenants', id);
const run = (args) => { const r = spawnSync('docker', args, { cwd: dir, encoding: 'utf8', windowsHide: true }); if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr.trim()); return r.stdout.trim(); };
const env = Object.fromEntries((await fs.readFile(path.join(dir, '.env'), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const compose = ['compose', '-p', env.COMPOSE_PROJECT_NAME, '--env-file', path.join(dir, '.env'), '-f', path.join(dir, 'compose.yaml')];
if (flag === '--preflight') {
  if (catalog[id].image === image) console.log('Digest candidato é igual ao digest em execução.');
  else console.log(`Digest atual: ${catalog[id].image}`);
  run(['image', 'inspect', image]);
  run([...compose, 'run', '--rm', '--no-deps', 'app', 'node', 'scripts/database-schema.mjs', 'preflight']);
  console.log(`Preflight concluído para ${id}; candidato ${image}; nenhuma imagem ou schema foi alterado.`);
} else {
  if (process.env.MAGISFORM_DEPLOY_BACKUP !== 'verified') throw new Error('Apply exige backup cifrado concluído e restauração ensaiada. Defina MAGISFORM_DEPLOY_BACKUP=verified após validar a evidência.');
  const check = spawnSync('docker', ['image', 'inspect', image], { encoding: 'utf8', windowsHide: true });
  if (check.error || check.status !== 0) throw new Error('A imagem imutável informada não está presente no host.');
  const envPath = path.join(dir, '.env'); const nextPath = path.join(dir, '.env.next');
  await fs.writeFile(nextPath, envLines(await fs.readFile(envPath, 'utf8'), image), { flag: 'wx', mode: 0o600 });
  try {
    run(['compose', '-p', env.COMPOSE_PROJECT_NAME, '--env-file', nextPath, '-f', path.join(dir, 'compose.yaml'), 'run', '--rm', '--no-deps', 'app', 'node', 'scripts/database-schema.mjs', 'preflight']);
    run(['compose', '-p', env.COMPOSE_PROJECT_NAME, '--env-file', nextPath, '-f', path.join(dir, 'compose.yaml'), 'up', '-d', '--no-deps', 'app']);
    const health = run(['inspect', '--format', '{{.State.Health.Status}}', `${env.COMPOSE_PROJECT_NAME}-app-1`]);
    if (health !== 'healthy') throw new Error(`Smoke healthcheck falhou (${health}); preserve .env e imagem anterior para rollback.`);
    await fs.rename(nextPath, envPath);
    catalog[id].image = image;
    await fs.writeFile(path.join(root, 'deploy/tenants/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
    const manifestPath = path.join(dir, 'installation.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); manifest.image = image;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Deploy individual concluído; schema não foi atualizado automaticamente.');
  } catch (error) {
    console.error('O app/env anterior foi preservado quando possível. Não apague .env.next até revisar o estado do container.');
    throw error;
  }
}

function envLines(current, nextImage) { return current.split(/\r?\n/).map((line) => line.startsWith('MAGISFORM_IMAGE=') ? `MAGISFORM_IMAGE=${nextImage}` : line).join('\n'); }
