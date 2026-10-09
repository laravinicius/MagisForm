import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { invokeRemote, loginRemote } from '../electron/remoteAdapter';

const base = { host: process.env.MARIADB_HOST ?? '127.0.0.1', port: Number(process.env.MARIADB_PORT ?? 3306), user: process.env.MARIADB_USER ?? 'root', password: process.env.MARIADB_PASSWORD ?? '' };
const database = `magisform_server_${crypto.randomBytes(4).toString('hex')}`;
let admin: mysql.Connection;
let pool: mysql.Pool;
let app: Awaited<ReturnType<typeof buildApp>>;
const enabled = !!process.env.MARIADB_HOST;
const cookieHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value ?? '').split(';')[0];

describe.skipIf(!enabled)('API HTTP com MariaDB isolado', () => {
  beforeAll(async () => {
    admin = await mysql.createConnection({ ...base, multipleStatements: true });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const sql = (await readFile(path.resolve('database.sql'), 'utf8')).replace(/CREATE DATABASE IF NOT EXISTS magisform[\s\S]*?;\s*USE magisform;?/i, '');
    await admin.query(`USE \`${database}\`; ${sql}`);
    pool = mysql.createPool({ ...base, database, dateStrings: true, timezone: '-03:00' });
    const password = crypto.createHash('sha256').update('senha-de-teste').digest('hex');
    await pool.execute('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)', ['Admin QA', 'admin-qa', password, 'admin']);
    await pool.execute('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)', ['Gerente QA', 'manager-qa', password, 'manager']);
    await pool.execute('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)', ['Electron remoto QA', 'electron-remote-qa', password, 'admin']);
    await pool.execute('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)', ['Browser QA', 'browser-qa', password, 'admin']);
    await pool.execute('INSERT INTO schema_version(singleton,version,source,checksum) VALUES(1,2,?,?)', ['bootstrap', '0'.repeat(64)]);
    const config = loadConfig({ NODE_ENV: 'test', MAGISFORM_SERVER_HOST: '127.0.0.1', MAGISFORM_SERVER_PORT: '3001', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_PORT: String(base.port), MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password });
    app = await buildApp({ config, pool, closePool: false });
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
  });

  it('publica health e OpenAPI sem divulgar detalhes internos', async () => {
    const live = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json().data).toEqual({ status: 'ok' });
    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.statusCode).toBe(200);
    const openapi = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().paths['/api/v1/customers'].post.requestBody).toBeDefined();
    expect(openapi.json().components.schemas.UserDto).toBeDefined();
    expect(JSON.stringify(ready.json())).not.toMatch(/password|sql|host/i);
  });

  it('valida configuração de produção e encerra o pool no shutdown', async () => {
    const productionEnv = { NODE_ENV: 'production', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password };
    expect(() => loadConfig(productionEnv)).toThrow(/ORIGIN HTTPS/);
    expect(() => loadConfig({ ...productionEnv, MAGISFORM_SERVER_ORIGIN: 'https://farmacia.example', MAGISFORM_SERVER_TRUST_PROXY: 'not-an-ip' })).toThrow(/IPs\/CIDRs de proxy/);
    expect(loadConfig({ ...productionEnv, MAGISFORM_SERVER_ORIGIN: 'https://farmacia.example', MAGISFORM_SERVER_TRUST_PROXY: '172.28.16.0/24' }).trustProxy).toEqual(['172.28.16.0/24']);
    expect(() => loadConfig({ NODE_ENV: 'test', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password, MAGISFORM_SERVER_BRAND_PRIMARY: 'red; background:url(javascript:1)' })).toThrow(/Configuração do servidor inválida/);
    expect(() => loadConfig({ NODE_ENV: 'test', MAGISFORM_SERVER_HOST: '0.0.0.0', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password })).toThrow(/loopback/);
    const ownedPool = mysql.createPool({ ...base, database });
    const ownedApp = await buildApp({ config: loadConfig({ NODE_ENV: 'test', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password }), pool: ownedPool });
    await ownedApp.close();
    await expect(ownedPool.query('SELECT 1')).rejects.toThrow();
  });

  it('aceita Host e HTTPS encaminhados somente por CIDR confiável', async () => {
    const proxyConfig = loadConfig({ NODE_ENV: 'production', MAGISFORM_SERVER_HOST: '0.0.0.0', MAGISFORM_SERVER_ORIGIN: 'https://farmacia.example', MAGISFORM_SERVER_TRUST_PROXY: '10.20.30.0/24', MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_PORT: String(base.port), MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password });
    const proxyApp = await buildApp({ config: proxyConfig, pool, closePool: false });
    try {
      const localHealth = await proxyApp.inject({ method: 'GET', url: '/health/live', remoteAddress: '127.0.0.1', headers: { host: 'localhost' } });
      expect(localHealth.statusCode).toBe(200);
      const trusted = await proxyApp.inject({ method: 'GET', url: '/api/v1/health/live', remoteAddress: '10.20.30.9', headers: { host: 'farmacia.example', 'x-forwarded-proto': 'https' } });
      expect(trusted.statusCode).toBe(200);
      const spoofed = await proxyApp.inject({ method: 'GET', url: '/api/v1/health/live', remoteAddress: '127.0.0.1', headers: { host: 'farmacia.example', 'x-forwarded-proto': 'https' } });
      expect(spoofed.statusCode).toBe(404);
      const wrongHost = await proxyApp.inject({ method: 'GET', url: '/api/v1/health/live', remoteAddress: '10.20.30.9', headers: { host: 'outra-farmacia.example', 'x-forwarded-proto': 'https' } });
      expect(wrongHost.statusCode).toBe(404);
      const wrongProtocol = await proxyApp.inject({ method: 'GET', url: '/api/v1/health/live', remoteAddress: '10.20.30.9', headers: { host: 'farmacia.example', 'x-forwarded-proto': 'http' } });
      expect(wrongProtocol.statusCode).toBe(404);
    } finally { await proxyApp.close(); }
  });

  it('protege login web com Origin/CSRF, valida payload e retorna erro seguro', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/v1/customers' });
    expect(denied.statusCode).toBe(401);
    const csrf = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    const csrfToken = csrf.json().data.csrfToken;
    const csrfCookie = cookieHeader(csrf.headers['set-cookie']);
    const noCsrf = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://127.0.0.1:3001', cookie: csrfCookie }, payload: { username: 'admin-qa', password: 'senha-de-teste' } });
    expect(noCsrf.statusCode).toBe(403);
    const badOrigin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://attacker.invalid', cookie: csrfCookie, 'x-csrf-token': csrfToken }, payload: { username: 'admin-qa', password: 'senha-de-teste' } });
    expect(badOrigin.statusCode).toBe(403);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://127.0.0.1:3001', cookie: csrfCookie, 'x-csrf-token': csrfToken }, payload: { username: '', password: '' } });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.stringify(invalid.json())).not.toMatch(/stack|sql|password/i);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const failedLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'rate-limit-qa', password: 'senha-incorreta' } });
      expect(failedLogin.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'rate-limit-qa', password: 'senha-incorreta' } });
    expect(limited.statusCode).toBe(429);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/setup' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/database' })).statusCode).toBe(404);
    expect(limited.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('executa login único, perfis e ciclo CRUD HTTP de clientes/insumos/fórmulas/modelos', async () => {
    const csrf = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    const csrfToken = csrf.json().data.csrfToken;
    const csrfCookie = cookieHeader(csrf.headers['set-cookie']);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://127.0.0.1:3001', cookie: csrfCookie, 'x-csrf-token': csrfToken }, payload: { username: 'admin-qa', password: 'senha-de-teste' } });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user).toMatchObject({ username: 'admin-qa', role: 'admin' });
    expect(JSON.stringify(login.json())).not.toMatch(/token|password/i);
    const sessionHeader = login.headers['set-cookie'];
    const sessionCookie = (Array.isArray(sessionHeader) ? sessionHeader : [sessionHeader]).find((value) => value?.startsWith('magisform_dev_session='))?.split(';')[0] ?? '';
    const sessionSetCookie = (Array.isArray(sessionHeader) ? sessionHeader : [sessionHeader]).find((value) => value?.startsWith('magisform_dev_session=')) ?? '';
    expect(sessionSetCookie).toMatch(/HttpOnly/i);
    expect(sessionSetCookie).toMatch(/SameSite=Lax/i);
    expect(sessionSetCookie).not.toMatch(/Domain=/i);
    const webToken = sessionCookie.slice(sessionCookie.indexOf('=') + 1);
    const [storedWebToken] = await pool.execute<mysql.RowDataPacket[]>('SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.username=?', ['admin-qa']);
    expect(storedWebToken[0].token).toBe(crypto.createHash('sha256').update(webToken).digest('hex'));
    const webHeaders = { origin: 'http://127.0.0.1:3001', cookie: `${csrfCookie}; ${sessionCookie}`, 'x-csrf-token': csrfToken };
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: webHeaders })).json().data.authenticated).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/heartbeat', headers: webHeaders })).json().data.valid).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/v1/public-config' })).json().data).toMatchObject({ installationName: 'MagisForm', brand: 'MagisForm' });
    expect((await app.inject({ method: 'GET', url: '/api/v1/customers', headers: { ...webHeaders, authorization: `Bearer ${webToken}` } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/customers', headers: { cookie: `${csrfCookie}; ${sessionCookie}` }, payload: { name: 'CSRF negado', phone: '5511000000000' } })).statusCode).toBe(403);
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'admin-qa', password: 'senha-de-teste' } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('SESSION_CONFLICT');

    const user = await app.inject({ method: 'POST', url: '/api/v1/users', headers: webHeaders, payload: { name: 'Funcionário QA', username: 'employee-qa', password: 'senha', role: 'employee' } });
    expect(user.statusCode).toBe(200);
    expect(JSON.stringify(user.json())).not.toMatch(/password|token/i);
    const userId = user.json().data.id;
    expect((await app.inject({ method: 'GET', url: '/api/v1/users', headers: webHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${userId}`, headers: webHeaders, payload: { name: 'Funcionário QA 2' } })).statusCode).toBe(200);
    const customer = await app.inject({ method: 'POST', url: '/api/v1/customers', headers: webHeaders, payload: { name: 'Paciente QA', phone: '5511999900011' } });
    expect(customer.statusCode).toBe(200);
    const customerId = customer.json().data.id;
    expect((await app.inject({ method: 'GET', url: '/api/v1/customers', headers: webHeaders })).json().data.some((x: any) => x.id === customerId)).toBe(true);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/customers/${customerId}`, headers: webHeaders, payload: { name: 'Paciente QA 2' } })).statusCode).toBe(200);
    const insumo = await app.inject({ method: 'POST', url: '/api/v1/insumos', headers: webHeaders, payload: { name: 'Insumo QA' } });
    expect(insumo.statusCode).toBe(200);
    const insumoId = insumo.json().data.id;
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/insumos/${insumoId}`, headers: webHeaders, payload: { name: 'Insumo QA 2' } })).statusCode).toBe(200);
    const formulaPayload = { customer_id: customerId, attendant_name: 'Atendente QA', items: [{ insumo_id: insumoId, quantity: 1, unit: 'mg' }], budget_number: 'Q601', budget_items: [{ quantity: 30, unit: 'caps', value: 20, is_selected: true }] };
    const formula = await app.inject({ method: 'POST', url: '/api/v1/formulas', headers: webHeaders, payload: formulaPayload });
    expect(formula.statusCode).toBe(200);
    const formulaId = formula.json().data.id;
    expect((await app.inject({ method: 'GET', url: '/api/v1/formulas', headers: webHeaders })).statusCode).toBe(426);
    const formulaPage = await app.inject({ method: 'GET', url: '/api/v1/formulas?limit=50&statuses=pending', headers: webHeaders });
    expect(formulaPage.statusCode).toBe(200);
    expect(formulaPage.json().data.rows.map((row: any) => row.id)).toContain(formulaId);
    expect((await app.inject({ method: 'GET', url: `/api/v1/formulas/${formulaId}`, headers: webHeaders })).json().data.id).toBe(formulaId);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/formulas/${formulaId}`, headers: webHeaders, payload: { ...formulaPayload, attendant_name: 'Atendente QA 2', payment_status: 'pago', delivery_status: 'aguardando_retirada', status: 'confirmed' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/formulas/${formulaId}/status`, headers: webHeaders, payload: { status: 'confirmed' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/formulas/${formulaId}/delivery-status`, headers: webHeaders, payload: { status: 'entregue' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: '/api/v1/formulas/delivery-status-batch', headers: webHeaders, payload: { ids: [formulaId], status: 'em_reentrega' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/formulas/${formulaId}/verification`, headers: webHeaders, payload: {} })).statusCode).toBe(403);
    const manager = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'manager-qa', password: 'senha-de-teste' } });
    expect(manager.statusCode).toBe(200);
    const managerToken = manager.json().data.token;
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${managerToken}` } })).json().data.user.role).toBe('manager');
    expect((await app.inject({ method: 'POST', url: `/api/v1/formulas/${formulaId}/verification`, headers: { authorization: `Bearer ${managerToken}` }, payload: {} })).statusCode).toBe(200);
    const employee = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'employee-qa', password: 'senha' } });
    const employeeToken = employee.json().data.token;
    expect((await app.inject({ method: 'GET', url: '/api/v1/customers', headers: { authorization: `Bearer ${employeeToken}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/logs', headers: { authorization: `Bearer ${employeeToken}` } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${employeeToken}` } })).statusCode).toBe(200);
    const forced = await app.inject({ method: 'POST', url: '/api/v1/auth/desktop/login', payload: { username: 'manager-qa', password: 'senha-de-teste', force: true } });
    expect(forced.statusCode).toBe(200);
    const forcedToken = forced.json().data.token;
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${managerToken}` } })).statusCode).toBe(401);
    const saved = await app.inject({ method: 'POST', url: '/api/v1/saved-formulas', headers: webHeaders, payload: { name: 'Modelo QA', items: [{ insumo_id: insumoId, quantity: 1, unit: 'mg' }], budget_items: [{ quantity: 30, unit: 'caps', value: 20 }] } });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/saved-formulas', headers: webHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/saved-formulas/${saved.json().data.id}`, headers: webHeaders, payload: { name: 'Modelo QA atualizado' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/logs', headers: webHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/logs?page=1&pageSize=20&search=QA', headers: webHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/saved-formulas/${saved.json().data.id}`, headers: webHeaders, payload: { username: 'admin-qa', password: 'senha-de-teste' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/formulas/${formulaId}`, headers: webHeaders, payload: { username: 'admin-qa', password: 'senha-de-teste' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/insumos/${insumoId}`, headers: webHeaders, payload: { username: 'admin-qa', password: 'senha-de-teste' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/customers/${customerId}`, headers: webHeaders, payload: { username: 'admin-qa', password: 'senha-de-teste' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/users/${userId}`, headers: webHeaders, payload: { username: 'admin-qa', password: 'senha-de-teste' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${forcedToken}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: webHeaders })).statusCode).toBe(200);
  });

  it('prova Electron remoto e browser com contas distintas na mesma base', async () => {
    const portServer = net.createServer();
    await new Promise<void>((resolve, reject) => portServer.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = portServer.address();
    if (!address || typeof address === 'string') throw new Error('Porta QA indisponível.');
    const port = address.port;
    await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
    const pairedApp = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', MAGISFORM_SERVER_HOST: '127.0.0.1', MAGISFORM_SERVER_PORT: String(port), MAGISFORM_SERVER_DB_HOST: base.host, MAGISFORM_SERVER_DB_PORT: String(base.port), MAGISFORM_SERVER_DB_NAME: database, MAGISFORM_SERVER_DB_USER: base.user, MAGISFORM_SERVER_DB_PASSWORD: base.password }),
      pool,
      closePool: false,
    });
    const origin = await pairedApp.listen({ host: '127.0.0.1', port });
    const config = { connectionMode: 'remote' as const, serverUrl: origin, host: '', port: 3306, user: '', password: '', database: '' };
    const webContents = { id: 8765, send: () => {} };
    const fakeWindow = { webContents } as any;
    try {
      const electronLogin = await loginRemote(webContents.id, config, 'electron-remote-qa', 'senha-de-teste', false, false);
      expect(electronLogin.success).toBe(true);
      expect(electronLogin.sessionToken).toBe('remote-session');
      expect(electronLogin.sessionToken).not.toMatch(/^[A-Za-z0-9_-]{32,128}$/);
      const duplicateLogin = await loginRemote(webContents.id + 1, config, 'electron-remote-qa', 'senha-de-teste', false, false);
      expect(duplicateLogin).toMatchObject({ success: false, conflict: true });

      const csrfResponse = await fetch(`${origin}/api/v1/auth/csrf`);
      const csrf = (await csrfResponse.json() as any).data.csrfToken;
      const csrfCookie = csrfResponse.headers.get('set-cookie')!.split(';')[0];
      const webLoginResponse = await fetch(`${origin}/api/v1/auth/login`, { method: 'POST', headers: { Origin: origin, Cookie: csrfCookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'browser-qa', password: 'senha-de-teste' }) });
      expect(webLoginResponse.status).toBe(200);
      const webCookies = webLoginResponse.headers.get('set-cookie')!.split(/, (?=[^;]+=)/).map(value => value.split(';')[0]);
      const webCookie = `${csrfCookie}; ${webCookies.find(value => value.startsWith('magisform_dev_session='))}`;
      const webHeaders = { Origin: origin, Cookie: webCookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };

      const electronCreated = await invokeRemote(fakeWindow, config, 'customers:add', [{ name: 'Paciente Electron QA', phone: '5511999990011' }], false) as any;
      expect(electronCreated.success).toBe(true);
      const webReadsElectron = await fetch(`${origin}/api/v1/customers`, { headers: webHeaders });
      const webRows = (await webReadsElectron.json() as any).data;
      expect(webRows.some((row: any) => row.name === 'Paciente Electron QA')).toBe(true);

      const webCreated = await fetch(`${origin}/api/v1/customers`, { method: 'POST', headers: webHeaders, body: JSON.stringify({ name: 'Paciente Browser QA', phone: '5511999990012' }) });
      expect(webCreated.status).toBe(200);
      const electronReadsWeb = await invokeRemote(fakeWindow, config, 'customers:list', ['passive'], false) as any[];
      expect(electronReadsWeb.some(row => row.name === 'Paciente Browser QA')).toBe(true);

      await fetch(`${origin}/api/v1/auth/logout`, { method: 'POST', headers: webHeaders, body: '{}' });
      await invokeRemote(fakeWindow, config, 'auth:logout', [], false);
      const [remainingSessions] = await pool.execute<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS count FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ('electron-remote-qa','browser-qa'))`);
      expect(Number(remainingSessions[0].count)).toBe(0);
    } finally {
      await pairedApp.close();
    }
  });
});
