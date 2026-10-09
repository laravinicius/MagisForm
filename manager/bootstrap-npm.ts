import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapNpmCredentials, NpmClient } from './npm.js';

const execFileAsync = promisify(execFile);
const [host, mode, email = ''] = process.argv.slice(2);
const baseUrl = process.env.MAGISFORM_NPM_API_ORIGIN ?? 'http://npm:81/api';
const stateDir = process.env.MAGISFORM_NPM_STATE_DIR ?? '/state';
const credentialsFile = path.join(stateDir, 'npm-credentials.json');
if (!host || !['local', 'public'].includes(mode)) throw new Error('Uso: bootstrap-npm <host> <local|public> [email]');
if (mode === 'public' && !email.includes('@')) throw new Error('Modo público exige um e-mail válido para o certificado.');

await mkdir(stateDir, { recursive: true, mode: 0o700 });
const initialAdminPassword = await readFile(path.join(stateDir, 'npm-initial-admin-password.txt'), 'utf8').then((value) => value.trim());
if (initialAdminPassword.length < 32) throw new Error('Senha inicial protegida do NPM ausente ou inválida.');
await bootstrapNpmCredentials(baseUrl, credentialsFile, initialAdminPassword, mode === 'public' ? email : undefined);
if (host === '--credentials-only') {
  console.log('Credenciais do NPM inicializadas.');
  process.exit(0);
}
const npm = await NpmClient.fromFile(baseUrl, credentialsFile);
let certificateId: number;
if (mode === 'public') {
  certificateId = await npm.ensureCertificate({ host, publicMode: true, email });
} else {
  const labels = host.split('.');
  if (labels.length < 3 || labels.at(-1) !== 'test') throw new Error('O modo local exige hostname com sufixo .test e subdomínio.');
  const zone = labels.slice(1).join('.');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'magisform-test-cert-'));
  try {
    const keyPath = path.join(tmp, 'test.key');
    const certPath = path.join(tmp, 'test.crt');
    await execFileAsync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '3650',
      '-keyout', keyPath, '-out', certPath, '-subj', `/CN=*.${zone}`,
      '-addext', `subjectAltName=DNS:*.${zone},DNS:${zone}`,
    ], { timeout: 20_000 });
    certificateId = await npm.ensureLocalCertificate({
      domainNames: [`*.${zone}`, zone], certificate: await readFile(certPath, 'utf8'), key: await readFile(keyPath, 'utf8'),
    });
  } finally { await rm(tmp, { recursive: true, force: true }); }
}
const proxyHostId = await npm.ensureProxyHost({ host, forwardHost: 'api', forwardPort: 3003, certificateId, secure: true });
const result = { host, mode, certificateId, proxyHostId };
await writeFile(path.join(stateDir, 'npm-bootstrap.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'w', mode: 0o600 });
console.log(JSON.stringify(result));
