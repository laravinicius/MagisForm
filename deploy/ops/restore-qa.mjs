import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const [encryptedFile, target] = process.argv.slice(2);
const identity = process.env.AGE_IDENTITY;
if (!encryptedFile || !target || !identity) throw new Error('Uso: AGE_IDENTITY=<chave-privada> node deploy/ops/restore-qa.mjs <backup.tar.age> <diretorio-qa-novo>');
const destination = path.resolve(target);
try { await fs.access(destination); throw new Error('O destino já existe; use um diretório QA vazio.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const run = (args, command = 'docker') => { const r = spawnSync(command, args, { encoding: 'utf8', windowsHide: true }); if (r.error || r.status !== 0) throw new Error(`${command} falhou: ${r.error?.message ?? r.stderr.trim()}`); return r.stdout ?? ''; };
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'magisform-restore-'));
if (process.platform !== 'win32') await fs.chmod(work, 0o700);
try {
  const bundle = path.join(work, 'bundle.tar');
  const mount = (source, target, readOnly = false) => `type=bind,source=${source},target=${target}${readOnly ? ',readonly' : ''}`;
  run(['run', '--rm', '--mount', mount(work, '/work'), '--mount', mount(path.dirname(path.resolve(identity)), '/keys', true), '--mount', mount(path.dirname(path.resolve(encryptedFile)), '/input', true), '-e', `AGE_IDENTITY=/keys/${path.basename(identity)}`, 'alpine:3.21.3', 'sh', '-c', 'apk add --no-cache age >/dev/null && age -d -i "$AGE_IDENTITY" -o /work/bundle.tar "/input/$1"', 'age-restore', path.basename(path.resolve(encryptedFile))]);
  const names = run(['-tf', bundle], 'tar').split(/\r?\n/).filter(Boolean);
  if (names.some((name) => path.isAbsolute(name) || name.split(/[\\/]/).includes('..'))) throw new Error('Arquivo contém caminho fora do pacote esperado.');
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  run(['-xf', bundle, '-C', destination], 'tar');
  const manifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.tenants) || !manifest.tenants.every((tenant) => /^[a-z][a-z0-9-]{1,30}$/.test(tenant.id) && tenant.database === `${tenant.id}.sql`)) throw new Error('Manifesto do backup inválido.');
  console.log(JSON.stringify({ restoredTo: destination, createdAt: manifest.createdAt, npmImage: manifest.npmImage, tenants: manifest.tenants.map(({ id, host }) => ({ id, host })), next: 'Use o runbook docs/deployment/operations.md para carregar estes artefatos somente em volumes Compose QA novos.' }, null, 2));
} finally { await fs.rm(work, { recursive: true, force: true }); }
