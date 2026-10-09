import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(process.env.MAGISFORM_MANAGER_ROOT ?? path.resolve(import.meta.dirname, '../..'));
const output = process.env.MAGISFORM_BACKUP_DIR;
const recipient = process.env.AGE_RECIPIENT;
const managerState = process.env.MAGISFORM_MANAGER_STATE_DIR;
if (!output || !recipient) throw new Error('Defina MAGISFORM_BACKUP_DIR fora do repositório e AGE_RECIPIENT (chave pública age).');
const run = (command, args, opts = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...opts });
  if (result.error || result.status !== 0) throw new Error(`${command} falhou: ${result.error?.message ?? result.stderr?.trim()}`);
  return result.stdout ?? '';
};
const catalogue = JSON.parse(await fs.readFile(path.join(root, 'deploy/tenants/catalog.json'), 'utf8'));
const tenants = Object.entries(catalogue).filter(([, tenant]) => tenant.status === 'provisioned');
if (!tenants.length) throw new Error('Não há instalações provisionadas para incluir no backup.');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'magisform-backup-'));
if (process.platform !== 'win32') await fs.chmod(work, 0o700);
const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z');
const encrypted = path.join(output, `magisform-${stamp}.tar.age`);
const manifest = { createdAt: new Date().toISOString(), npmImage: 'jc21/nginx-proxy-manager:2.16.0', managerStateIncluded: Boolean(managerState), tenantOperationsIncluded: true, tenants: [] };
try {
  const npmData = process.env.MAGISFORM_NPM_DATA_VOLUME || 'magisform_npm_data';
  const npmCerts = process.env.MAGISFORM_NPM_CERTS_VOLUME || 'magisform_npm_letsencrypt';
  const npmDefaultTls = process.env.MAGISFORM_NPM_DEFAULT_TLS_VOLUME || 'magisform_npm_default_tls';
  const npmSnapDir = path.join(work, 'npm-snapshot');
  await fs.mkdir(npmSnapDir);
  run('docker', ['run', '--rm', '-v', `${npmData}:/src`, '-v', `${npmSnapDir}:/out`, 'python:3.13.7-alpine', 'python3', '-c', "import sqlite3; src=sqlite3.connect('/src/database.sqlite'); dst=sqlite3.connect('/out/database.sqlite'); src.backup(dst); dst.close(); src.close()"]);
  for (const volume of [npmData, npmCerts, npmDefaultTls]) run('docker', ['volume', 'inspect', volume]);
  const dataTar = path.join(work, 'npm-data.tar');
  run('docker', ['run', '--rm', '-v', `${npmData}:/src:ro`, '-v', `${work}:/out`, 'alpine:3.21.3', 'sh', '-c', "cd /src && tar --exclude='./database.sqlite' --exclude='./database.sqlite-wal' --exclude='./database.sqlite-shm' -cf /out/npm-data.tar ."]);
  const certTar = path.join(work, 'npm-certificates.tar');
  run('docker', ['run', '--rm', '-v', `${npmCerts}:/src:ro`, '-v', `${work}:/out`, 'alpine:3.21.3', 'sh', '-c', 'cd /src && tar -cf /out/npm-certificates.tar .']);
  const defaultTlsTar = path.join(work, 'npm-default-tls.tar');
  run('docker', ['run', '--rm', '-v', `${npmDefaultTls}:/src:ro`, '-v', `${work}:/out`, 'alpine:3.21.3', 'sh', '-c', 'cd /src && tar -cf /out/npm-default-tls.tar .']);
  for (const [id, tenant] of tenants) {
    const install = path.join(root, tenant.compose, '..');
    const compose = ['compose', '-p', `magisform-${id}`, '--env-file', path.join(install, '.env'), '-f', path.join(install, 'compose.yaml')];
    const service = run('docker', [...compose, 'ps', '-q', 'db']).trim();
    if (!service) throw new Error(`MariaDB de ${id} não está em execução.`);
    const sql = path.join(work, `${id}.sql`);
    const shell = "umask 077; f=/tmp/magisform-backup.cnf; printf '[client]\\nuser=root\\npassword=%s\\n' \"$(cat /run/secrets/db_root_password)\" > \"$f\"; trap 'rm -f \"$f\"' EXIT; mariadb-dump --defaults-extra-file=\"$f\" --single-transaction --quick --routines --events --triggers --hex-blob magisform";
    const dump = spawnSync('docker', ['exec', '-i', service, 'sh', '-c', shell], { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
    if (dump.error || dump.status !== 0) throw new Error(`Dump MariaDB ${id} falhou: ${dump.error?.message ?? dump.stderr?.trim()}`);
    await fs.writeFile(sql, dump.stdout, { mode: 0o600 });
    manifest.tenants.push({ id, host: tenant.host, image: tenant.image, database: `${id}.sql`, volume: `magisform-${id}_mariadb_data` });
  }
  const tenantOperations = path.join(work, 'tenant-operations');
  await fs.cp(path.join(root, 'deploy', 'tenants'), tenantOperations, { recursive: true, errorOnExist: true, force: false });
  const bundleEntries = ['npm-snapshot', 'npm-data.tar', 'npm-certificates.tar', 'npm-default-tls.tar', 'tenant-operations', 'manifest.json', ...manifest.tenants.map((t) => t.database)];
  if (managerState) {
    await fs.access(managerState);
    await fs.cp(managerState, path.join(work, 'manager-state'), { recursive: true, errorOnExist: true, force: false });
    bundleEntries.push('manager-state');
  }
  await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const bundle = path.join(work, 'magisform-complete.tar');
  run('tar', ['-C', work, '-cf', bundle, ...bundleEntries]);
  const mount = (source, target, readOnly = false) => `type=bind,source=${source},target=${target}${readOnly ? ',readonly' : ''}`;
  run('docker', ['run', '--rm', '--mount', mount(work, '/work'), '--mount', mount(output, '/out'), '-e', `AGE_RECIPIENT=${recipient}`, 'alpine:3.21.3', 'sh', '-c', 'apk add --no-cache age >/dev/null && age -r "$AGE_RECIPIENT" -o "/out/$1" /work/magisform-complete.tar', 'age-backup', path.basename(encrypted)]);
  console.log(JSON.stringify({ file: encrypted, bytes: (await fs.stat(encrypted)).size, tenants: manifest.tenants.map(({ id }) => id), createdAt: manifest.createdAt }, null, 2));
} finally {
  await fs.rm(work, { recursive: true, force: true });
}
