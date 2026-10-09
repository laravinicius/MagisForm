import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapNpmCredentials, NpmClient } from '../manager/npm.js';

function mockNpmFetch() {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = vi.fn(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    if (url.endsWith('/tokens')) return new Response(JSON.stringify({ token: 'unit-token' }), { status: 200 });
    if (url.endsWith('/nginx/certificates') && method === 'GET') return new Response(JSON.stringify([{ id: 42, provider: 'other', domain_names: ['*.magisform.test', 'magisform.test'] }]), { status: 200 });
    if (url.endsWith('/nginx/proxy-hosts') && method === 'GET') return new Response('[]', { status: 200 });
    if (url.endsWith('/nginx/proxy-hosts') && method === 'POST') return new Response(JSON.stringify({ id: 91 }), { status: 201 });
    if (url.endsWith('/nginx/certificates') && method === 'POST') return new Response(JSON.stringify({ id: 43 }), { status: 201 });
    return new Response('{}', { status: 200 });
  });
  return { calls, fetcher };
}

describe('Integração com Nginx Proxy Manager', () => {
  it('reusa certificado wildcard de teste e cria Proxy Host protegido', async () => {
    const { calls, fetcher } = mockNpmFetch();
    const npm = new NpmClient('http://npm:81/api', { identity: 'operator@example.test', secret: 'secret-value' }, fetcher);
    const certificateId = await npm.ensureCertificate({ host: 'farmacia-a.magisform.test', publicMode: false });
    const proxyHostId = await npm.ensureProxyHost({ host: 'farmacia-a.magisform.test', forwardHost: 'mf-farmacia-a', forwardPort: 3001, certificateId, secure: true });

    expect(certificateId).toBe(42);
    expect(proxyHostId).toBe(91);
    const payload = calls.find((call) => call.method === 'POST' && call.url.endsWith('/nginx/proxy-hosts'))?.body;
    expect(payload).toMatchObject({ domain_names: ['farmacia-a.magisform.test'], forward_host: 'mf-farmacia-a', forward_port: 3001, certificate_id: 42, ssl_forced: true, block_exploits: true, allow_websocket_upgrade: true });
    expect(payload?.advanced_config).toBe('access_log off;');
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/nginx/certificates'))).toBe(false);
  });

  it("solicita certificado individual Let's Encrypt no modo público", async () => {
    const { calls, fetcher } = mockNpmFetch();
    const npm = new NpmClient('http://npm:81/api', { identity: 'operator@example.test', secret: 'secret-value' }, fetcher);
    const certificateId = await npm.ensureCertificate({ host: 'farmacia.example.com', publicMode: true, email: 'admin@example.com' });
    const payload = calls.find((call) => call.method === 'POST' && call.url.endsWith('/nginx/certificates'))?.body;

    expect(certificateId).toBe(43);
    expect(payload).toMatchObject({ provider: 'letsencrypt', domain_names: ['farmacia.example.com'], meta: { dns_challenge: false } });
  });

  it('substitui a senha padrão e registra e-mail próprio no NPM', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'magisform-npm-test-'));
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const url = String(input); const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      calls.push({ url, method, body });
      if (url.endsWith('/tokens')) return new Response(JSON.stringify({ token: 'unit-token' }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    try {
      const file = path.join(directory, 'npm-credentials.json');
      await bootstrapNpmCredentials('http://npm:81/api', file, 'operador@example.com');
      const credentials = JSON.parse(await readFile(file, 'utf8')) as { identity: string; secret: string };

      expect(credentials.identity).toBe('operador@example.com');
      expect(credentials.secret).not.toBe('changeme');
      expect(credentials.secret.length).toBeGreaterThanOrEqual(40);
      expect(calls.some((call) => call.url.endsWith('/users/1/auth') && call.body?.current === 'changeme')).toBe(true);
      expect(calls.some((call) => call.url.endsWith('/users/1') && call.body?.email === 'operador@example.com')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
