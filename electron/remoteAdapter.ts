import type { BrowserWindow } from 'electron';
import mysql from 'mysql2/promise';
import type { DesktopConfigDto } from '../src/services/desktopTypes';
import type { PublicConfigDto } from '../shared/contracts';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RemoteErrorBody = { error?: { code?: string; message?: string } };
const tokens = new Map<number, string>();

export class RemoteApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'RemoteApiError';
  }
}

export function validateServerUrl(raw: unknown, allowLoopbackHttp: boolean): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Informe a URL do servidor.');
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('A URL do servidor é inválida.'); }
  if (url.username || url.password) throw new Error('A URL não pode conter usuário ou senha.');
  if (url.search || url.hash) throw new Error('A URL não pode conter parâmetros ou fragmento.');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Informe somente a origem HTTPS, sem caminho.');
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(allowLoopbackHttp && localHost && url.protocol === 'http:')) {
    throw new Error('Use uma URL HTTPS. HTTP é permitido somente em loopback de desenvolvimento.');
  }
  return url.origin;
}

const endpoint = (base: string, route: string) => `${base}/api/v1${route}`;

export async function getRemotePublicConfig(config: DesktopConfigDto, packaged: boolean): Promise<PublicConfigDto> {
  const base = validateServerUrl(config.serverUrl, !packaged);
  return request<PublicConfigDto>(base, '/public-config', 'GET', undefined, undefined, undefined, 'passive');
}

async function request<T>(base: string, route: string, method: Method, token: string | undefined, body?: unknown, query?: URLSearchParams, activity: 'user' | 'passive' = 'user'): Promise<T> {
  const response = await fetch(endpoint(base, route) + (query?.size ? `?${query}` : ''), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Magisform-Activity': activity,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
  });
  const payload = await response.json().catch(() => ({})) as { data?: T } & RemoteErrorBody;
  if (!response.ok) {
    const code = payload.error?.code ?? 'UNAVAILABLE';
    const message = payload.error?.message ?? 'Não foi possível comunicar com o servidor remoto.';
    throw new RemoteApiError(response.status, code, message);
  }
  return payload.data as T;
}

export function clearRemoteSession(windowId: number): void { tokens.delete(windowId); }

export async function loginRemote(windowId: number, config: DesktopConfigDto, username: string, password: string, force: boolean, packaged: boolean) {
  const base = validateServerUrl(config.serverUrl, !packaged);
  try {
    const result = await request<{ user: unknown; token: string }>(base, '/auth/desktop/login', 'POST', undefined, { username, password, force });
    tokens.set(windowId, result.token);
    // O marcador só indica sessão ativa ao renderer; nunca contém o Bearer.
    return { success: true, user: result.user, sessionToken: 'remote-session' };
  } catch (error) {
    if (error instanceof RemoteApiError && error.code === 'SESSION_CONFLICT') return { success: false, conflict: true, error: error.message };
    if (error instanceof RemoteApiError && error.status === 401) return { success: false, error: error.message };
    throw error;
  }
}

async function authenticated<T>(windowId: number, config: DesktopConfigDto, route: string, method: Method = 'GET', body?: unknown, query?: URLSearchParams, packaged = true, activity: 'user' | 'passive' = 'user'): Promise<T> {
  const token = tokens.get(windowId);
  if (!token) throw new Error('Sessão remota encerrada. Entre novamente.');
  const base = validateServerUrl(config.serverUrl, !packaged);
  try { return await request<T>(base, route, method, token, body, query, activity); }
  catch (error) {
    if (error instanceof RemoteApiError && error.status === 401) {
      tokens.delete(windowId);
      for (const win of (await import('electron')).BrowserWindow.getAllWindows()) win.webContents.send('auth:expired');
    }
    throw error;
  }
}

const idPath = (base: string, id: number) => `${base}/${encodeURIComponent(id)}`;
const operationResult = (promise: Promise<{ success: boolean; error?: string }>) => promise;

/** Mapeia IPC legado para a API HTTP mantendo o token dentro do processo principal. */
export async function invokeRemote(window: BrowserWindow, config: DesktopConfigDto, channel: string, args: unknown[], packaged: boolean): Promise<unknown> {
  const id = window.webContents.id;
  const call = <T>(route: string, method: Method = 'GET', body?: unknown, query?: URLSearchParams, activity: 'user' | 'passive' = 'user') => authenticated<T>(id, config, route, method, body, query, packaged, activity);
  const [a, b, c] = args as any[];
  switch (channel) {
    case 'auth:login': return loginRemote(id, config, a, b, c ?? false, packaged);
    case 'auth:logout':
      if (!tokens.has(id)) return { success: true };
      try { await call('/auth/logout', 'POST', {}); } finally { tokens.delete(id); }
      return { success: true };
    case 'session:heartbeat':
      try { return await call('/auth/heartbeat', 'POST', {}, undefined, 'passive'); }
      catch (error) { if (error instanceof RemoteApiError && error.status === 401) return { valid: false }; throw error; }
    case 'users:list': return call('/users', 'GET', undefined, undefined, a ?? 'user');
    case 'users:add': return operationResult(call('/users', 'POST', a));
    case 'users:update': return operationResult(call(idPath('/users', a), 'PATCH', b));
    case 'users:delete': return operationResult(call(idPath('/users', a), 'DELETE', b ?? {}));
    case 'customers:list': return call('/customers', 'GET', undefined, undefined, a ?? 'user');
    case 'customers:add': return operationResult(call('/customers', 'POST', a));
    case 'customers:update': return operationResult(call(idPath('/customers', a), 'PATCH', b));
    case 'customers:delete': return operationResult(call(idPath('/customers', a), 'DELETE', b ?? {}));
    case 'insumos:list': return call('/insumos', 'GET', undefined, undefined, a ?? 'user');
    case 'insumos:add': return operationResult(call('/insumos', 'POST', { name: a }));
    case 'insumos:update': return operationResult(call(idPath('/insumos', a), 'PATCH', { name: b }));
    case 'insumos:delete': return operationResult(call(idPath('/insumos', a), 'DELETE', b ?? {}));
    case 'formulas:list': {
      if (typeof a === 'string' || !a || typeof a !== 'object') throw new RemoteApiError(426, 'CLIENT_UPDATE_REQUIRED', 'Atualize o MagisForm para a versão 0.2.3 ou superior para consultar fórmulas.');
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(a as Record<string, unknown>)) {
        if (value === undefined || value === null || value === '') continue;
        query.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
      return call('/formulas', 'GET', undefined, query, b ?? 'user');
    }
    case 'formulas:get': return call(idPath('/formulas', a), 'GET', undefined, undefined, b ?? 'user');
    case 'formulas:summary': { const query = new URLSearchParams({ month: String(a), year: String(b) }); return call('/formulas-summary', 'GET', undefined, query, c ?? 'user'); }
    case 'formulas:add': return operationResult(call('/formulas', 'POST', a));
    case 'formulas:update': return operationResult(call(idPath('/formulas', a), 'PATCH', b));
    case 'formulas:update-status': return operationResult(call(`${idPath('/formulas', a)}/status`, 'PATCH', { status: b }));
    case 'formulas:update-delivery-status': return operationResult(call(`${idPath('/formulas', a)}/delivery-status`, 'PATCH', { status: b }));
    case 'formulas:verify': return operationResult(call(`${idPath('/formulas', a)}/verification`, 'POST', {}));
    case 'formulas:update-delivery-status-batch': return operationResult(call('/formulas/delivery-status-batch', 'PATCH', { ids: a, status: b }));
    case 'formulas:delete': return operationResult(call(idPath('/formulas', a), 'DELETE', b ?? {}));
    case 'savedFormulas:list': return call('/saved-formulas', 'GET', undefined, undefined, a ?? 'user');
    case 'savedFormulas:add': return operationResult(call('/saved-formulas', 'POST', a));
    case 'savedFormulas:update': return operationResult(call(idPath('/saved-formulas', a), 'PATCH', b));
    case 'savedFormulas:delete': return operationResult(call(idPath('/saved-formulas', a), 'DELETE', b ?? {}));
    case 'logs:list': {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(a ?? {})) if (value !== undefined && value !== '') query.set(key, String(value));
      return call('/logs', 'GET', undefined, query, b ?? 'user');
    }
    default: throw new Error(`Operação IPC indisponível no modo remoto: ${channel}`);
  }
}

export async function assertRemoteConfigAccess(windowId: number, config: DesktopConfigDto, packaged: boolean): Promise<void> {
  const user = await authenticated<{ authenticated: boolean; user?: { role?: string } }>(windowId, config, '/auth/me', 'GET', undefined, undefined, packaged);
  if (!user.authenticated || !['admin', 'manager', 'pharmacist'].includes(user.user?.role ?? '')) throw new Error('Apenas perfis privilegiados podem alterar a configuração.');
}

export async function testRemoteConnection(config: DesktopConfigDto, packaged: boolean) {
  try {
    const base = validateServerUrl(config.serverUrl, !packaged);
    await request<{ status: string }>(base, '/health/ready', 'GET', undefined);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Falha na conexão HTTPS.' }; }
}

export async function testDesktopConnection(config: DesktopConfigDto, packaged: boolean) {
  if (config.connectionMode === 'remote') return testRemoteConnection(config, packaged);
  let connection: mysql.Connection | undefined;
  try {
    connection = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database, connectTimeout: 5000 });
    await connection.query('SELECT 1');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Falha ao conectar ao MariaDB.' }; }
  finally { await connection?.end().catch(() => {}); }
}
