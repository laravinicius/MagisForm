import { readFile } from 'node:fs/promises';
import { buildManagerApi } from './api.js';
import { startAgent } from './agent.js';
import path from 'node:path';

const readSecret = async (path: string | undefined) => {
  if (!path) throw new Error('Arquivo de segredo obrigatório ausente.');
  return (await readFile(path, 'utf8')).trim();
};
const root = path.resolve(process.env.MAGISFORM_MANAGER_ROOT ?? '/opt/magisform');
const role = process.env.MAGISFORM_MANAGER_ROLE ?? 'api';
const token = await readSecret(process.env.MAGISFORM_MANAGER_AGENT_TOKEN_FILE);
const approvedImages = (process.env.MAGISFORM_MANAGER_APPROVED_IMAGES ?? '').split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean);
if (role === 'agent') {
  await startAgent({
    root, token, port: Number(process.env.MAGISFORM_MANAGER_AGENT_PORT ?? 3101), approvedImages,
    expectedImageId: process.env.MAGISFORM_MANAGER_EXPECTED_IMAGE_ID,
    publicMode: process.env.MAGISFORM_MANAGER_PUBLIC_MODE === 'true',
    certificateEmail: process.env.MAGISFORM_MANAGER_CERTIFICATE_EMAIL,
    localCertificateId: Number(process.env.MAGISFORM_MANAGER_LOCAL_CERTIFICATE_ID) || undefined,
    testDomainSuffix: process.env.MAGISFORM_MANAGER_TEST_DOMAIN_SUFFIX ?? '.magisform.test',
    originPortSuffix: process.env.MAGISFORM_MANAGER_ORIGIN_PORT_SUFFIX ?? '',
    npmApiOrigin: process.env.MAGISFORM_NPM_API_ORIGIN ?? 'http://npm:81/api',
    npmCredentialsFile: process.env.MAGISFORM_NPM_CREDENTIALS_FILE ?? '/run/secrets/npm_credentials',
  }, process.env.MAGISFORM_MANAGER_RUNTIME_ROOT ?? '/opt/magisform-runtime');
} else if (role === 'api') {
  const origin = process.env.MAGISFORM_MANAGER_ORIGIN;
  if (!origin) throw new Error('MAGISFORM_MANAGER_ORIGIN é obrigatório.');
  const secure = process.env.MAGISFORM_MANAGER_SECURE_COOKIES !== 'false';
  const trustProxy = process.env.MAGISFORM_MANAGER_TRUST_PROXY?.split(',').map((value) => value.trim()).filter(Boolean) ?? false;
  const app = await buildManagerApi({ config: { origin, secure, allowHostWithoutPort: process.env.MAGISFORM_MANAGER_ALLOW_HOST_WITHOUT_PORT === 'true', trustProxy, agentOrigin: process.env.MAGISFORM_MANAGER_AGENT_ORIGIN ?? 'http://agent:3101', agentToken: token, port: Number(process.env.MAGISFORM_MANAGER_PORT ?? 3003), operatorFile: process.env.MAGISFORM_MANAGER_OPERATOR_FILE ?? '/run/secrets/operator', approvedImages, testDomainSuffix: process.env.MAGISFORM_MANAGER_TEST_DOMAIN_SUFFIX ?? '.magisform.test', originPortSuffix: process.env.MAGISFORM_MANAGER_ORIGIN_PORT_SUFFIX ?? '', publicMode: process.env.MAGISFORM_MANAGER_PUBLIC_MODE === 'true', webRoot: process.env.MAGISFORM_MANAGER_WEB_ROOT ?? '/opt/magisform-runtime/dist-manager' } });
  await app.listen({ host: '0.0.0.0', port: Number(process.env.MAGISFORM_MANAGER_PORT ?? 3003) });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
} else throw new Error('MAGISFORM_MANAGER_ROLE deve ser api ou agent.');
