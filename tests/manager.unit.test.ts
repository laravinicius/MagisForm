import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildManagerApi } from '../manager/api.js';
import { createTotpSecret, decodeBase32, encodeBase32, matchingTotpStep, totpAt } from '../manager/totp.js';
import { validateTenantCreation } from '../manager/agent.js';
import type { ManagedTenant, TenantControl, TenantPackage } from '../manager/contracts.js';

const origin = 'http://127.0.0.1:3303';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const image = `ghcr.io/example/magisform@sha256:${'a'.repeat(64)}`;
const tenant: ManagedTenant = { id: 'farmacia-a', name: 'Farmácia A', host: 'a.example.com', image, status: 'provisioned', createdAt: '2026-10-01T00:00:00.000Z', containers: [] };
const packageFiles: TenantPackage = { id: 'farmacia-b', host: 'b.example.com', name: 'Farmácia B', image, compose: 'services: {}\n', envExample: 'MAGISFORM_IMAGE=approved\n', instructions: 'Instruções sem segredos.' };
const controlCalls: string[] = [];
const createInput = { id: 'farmacia-b', host: 'b.example.com', name: 'Farmácia B', adminName: 'Operador B', adminUsername: 'admin-b', image };
const control: TenantControl = {
  async list() { controlCalls.push('list'); return [tenant]; },
  async create(input) { controlCalls.push(`create:${input.id}`); return { name: input.adminName, username: input.adminUsername, password: 'one-time-secret' }; },
  async action(id, action) { controlCalls.push(`${action}:${id}`); },
  async generate() { controlCalls.push('generate'); return packageFiles; },
};

describe('TOTP do operador', () => {
  it('implementa RFC 6238 e rejeita segredo/código inválidos', () => {
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(matchingTotpStep(secret, '287082', 59_000)).toBe(1);
    expect(matchingTotpStep(secret, '12x456', 59_000)).toBeNull();
    expect(() => decodeBase32('!')).toThrow();
  });

  it('codifica segredo aleatório e decodifica os mesmos bytes', () => {
    const generated = createTotpSecret();
    expect(encodeBase32(decodeBase32(generated))).toBe(generated);
    expect(generated).toMatch(/^[A-Z2-7]+$/);
  });
});

describe('Validação do executor', () => {
  it('aceita somente hosts/IDs válidos, usuário limitado e digest de imagem aprovado', () => {
    expect(validateTenantCreation(createInput, [image])).toEqual(createInput);
    expect(() => validateTenantCreation({ ...createInput, image: `ghcr.io/untrusted/app@sha256:${'b'.repeat(64)}` }, [image])).toThrow('não está aprovada');
    expect(() => validateTenantCreation({ ...createInput, id: '../etc' }, [image])).toThrow();
    expect(() => validateTenantCreation({ ...createInput, host: 'not a host' }, [image])).toThrow();
    expect(() => validateTenantCreation({ ...createInput, adminUsername: 'admin;docker' }, [image])).toThrow();
  });
});

describe('API do painel de gestão', () => {
  let app: Awaited<ReturnType<typeof buildManagerApi>>;
  let currentCode = '';

  beforeAll(async () => {
    const passwordHash = await hash('senha-operador-qa', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    app = await buildManagerApi({
      config: { origin, secure: false, trustProxy: false, agentOrigin: 'http://127.0.0.1:1', agentToken: 'x'.repeat(48), port: 3303, operatorFile: '', approvedImages: [image] },
      operator: { username: 'operador-qa', passwordHash, totpSecret: secret }, control,
    });
    currentCode = totpAt(secret);
  });

  afterAll(async () => { if (app) await app.close(); });

  it('nega listagem sem sessão', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/manager/v1/installations' });
    expect(response.statusCode).toBe(401);
  });

  it('exige origem e CSRF antes do login', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/manager/v1/auth/login', payload: { username: 'operador-qa', password: 'senha-operador-qa', totp: currentCode } });
    expect(response.statusCode).toBe(403);
  });

  it('autentica com senha e TOTP, rejeita replay e limita ações à API autenticada', async () => {
    const csrf = await app.inject({ method: 'GET', url: '/api/manager/v1/auth/csrf' });
    const csrfToken = csrf.json().data.csrfToken as string;
    const cookies = (Array.isArray(csrf.headers['set-cookie']) ? csrf.headers['set-cookie'] : [csrf.headers['set-cookie']]).filter(Boolean).map((value) => String(value).split(';')[0]);
    const login = await app.inject({
      method: 'POST', url: '/api/manager/v1/auth/login',
      headers: { origin, cookie: cookies.join('; '), 'x-csrf-token': csrfToken },
      payload: { username: 'operador-qa', password: 'senha-operador-qa', totp: currentCode },
    });
    expect(login.statusCode).toBe(200);
    const session = (Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [login.headers['set-cookie']]).map((value) => String(value).split(';')[0]).find((value) => value.startsWith('mf_manager_dev_session='));
    expect(session).toBeTruthy();

    const replay = await app.inject({ method: 'POST', url: '/api/manager/v1/auth/login', headers: { origin, cookie: cookies.join('; '), 'x-csrf-token': csrfToken }, payload: { username: 'operador-qa', password: 'senha-operador-qa', totp: currentCode } });
    expect(replay.statusCode).toBe(401);

    const listing = await app.inject({ method: 'GET', url: '/api/manager/v1/installations', headers: { cookie: [...cookies, session].join('; ') } });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().data[0].id).toBe('farmacia-a');

    const withoutCsrf = await app.inject({ method: 'POST', url: '/api/manager/v1/installations/farmacia-a/actions', headers: { origin, cookie: [...cookies, session].join('; ') }, payload: { action: 'restart' } });
    expect(withoutCsrf.statusCode).toBe(403);
    const restart = await app.inject({ method: 'POST', url: '/api/manager/v1/installations/farmacia-a/actions', headers: { origin, cookie: [...cookies, session].join('; '), 'x-csrf-token': csrfToken }, payload: { action: 'restart' } });
    expect(restart.statusCode).toBe(200);
    expect(controlCalls).toContain('restart:farmacia-a');

    const created = await app.inject({ method: 'POST', url: '/api/manager/v1/installations', headers: { origin, cookie: [...cookies, session].join('; '), 'x-csrf-token': csrfToken }, payload: createInput });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.password).toBe('one-time-secret');

    const generated = await app.inject({ method: 'POST', url: '/api/manager/v1/installations/package', headers: { origin, cookie: [...cookies, session].join('; '), 'x-csrf-token': csrfToken }, payload: { ...createInput, id: 'farmacia-c', host: 'c.example.com', name: 'Farmácia C' } });
    expect(generated.statusCode).toBe(200);
    expect(JSON.stringify(generated.json())).not.toContain('one-time-secret');
    expect(generated.json().data.envExample).toContain('MAGISFORM_IMAGE=approved');
  });
});
