import type { BusinessOperations } from '../../shared/contracts';
import type { DesktopLoginResultDto } from './ipcAdapter';
export type DataActivity = 'user' | 'passive';

type BusinessAdapter = Omit<BusinessOperations, 'users' | 'customers' | 'insumos' | 'formulas' | 'savedFormulas' | 'logs'> & {
  auth: { login(u: string, p: string, force?: boolean): Promise<DesktopLoginResultDto>; logout(token?: string): Promise<any>; heartbeat(token?: string): Promise<any>; current(): Promise<DesktopLoginResultDto>; onExpired(listener: () => void): () => void };
  data: { onChanged(cb: () => void): () => void };
  logs: { list(filters?: Parameters<BusinessOperations['logs']['list']>[0], activity?: DataActivity): ReturnType<BusinessOperations['logs']['list']> };
  users: { list(activity?: DataActivity): ReturnType<BusinessOperations['users']['list']>; add(input: Parameters<BusinessOperations['users']['add']>[0], token?: string): Promise<any>; update(id: number, input: Parameters<BusinessOperations['users']['update']>[1], token?: string): Promise<any>; remove(id: number, credentials?: Parameters<BusinessOperations['users']['remove']>[1], token?: string): Promise<any> };
  customers: { list(activity?: DataActivity): ReturnType<BusinessOperations['customers']['list']>; add(input: Parameters<BusinessOperations['customers']['add']>[0], token?: string): Promise<any>; update(id: number, input: Parameters<BusinessOperations['customers']['update']>[1], token?: string): Promise<any>; remove(id: number, credentials?: Parameters<BusinessOperations['customers']['remove']>[1], token?: string): Promise<any> };
  insumos: { list(activity?: DataActivity): ReturnType<BusinessOperations['insumos']['list']>; add(name: string, token?: string): Promise<any>; update(id: number, name: string, token?: string): Promise<any>; remove(id: number, credentials?: Parameters<BusinessOperations['insumos']['remove']>[1], token?: string): Promise<any> };
  formulas: { list(query: Parameters<BusinessOperations['formulas']['list']>[0]): ReturnType<BusinessOperations['formulas']['list']>; get(id: number): ReturnType<BusinessOperations['formulas']['get']>; summary(month: number, year: number): ReturnType<BusinessOperations['formulas']['summary']>; add(input: Parameters<BusinessOperations['formulas']['add']>[0], token?: string): Promise<any>; update(id: number, input: Parameters<BusinessOperations['formulas']['update']>[1], token?: string): Promise<any>; updateStatus(id: number, status: string, token?: string): Promise<any>; updateDeliveryStatus(id: number, status: string, token?: string): Promise<any>; verify(id: number, token?: string): Promise<any>; updateDeliveriesStatus(ids: number[], status: string, token?: string): Promise<any>; remove(id: number, credentials?: Parameters<BusinessOperations['formulas']['remove']>[1], token?: string): Promise<any> };
  savedFormulas: { list(activity?: DataActivity): ReturnType<BusinessOperations['savedFormulas']['list']>; add(input: Parameters<BusinessOperations['savedFormulas']['add']>[0], token?: string): Promise<any>; update(id: number, input: Parameters<BusinessOperations['savedFormulas']['update']>[1], token?: string): Promise<any>; remove(id: number, credentials?: Parameters<BusinessOperations['savedFormulas']['remove']>[1], token?: string): Promise<any> };
};

export class DataTransportUnavailableError extends Error {
  constructor() { super('O acesso aos dados não está disponível neste modo.'); this.name = 'DataTransportUnavailableError'; }
}
const unavailable = (): never => { throw new DataTransportUnavailableError(); };
const loadAdapter = async (): Promise<BusinessAdapter> => {
  if (import.meta.env.VITE_APP_TRANSPORT === 'desktop') {
    const { ipcBusinessAdapter } = await import('./ipcAdapter');
    return ipcBusinessAdapter as BusinessAdapter;
  }
  const { httpBusinessAdapter } = await import('./httpAdapter');
  return httpBusinessAdapter as unknown as BusinessAdapter;
};
const call = <T>(fn: (adapter: BusinessAdapter) => Promise<T>): Promise<T> => loadAdapter().then(fn);
let sessionGeneration = 0;
const sessionListeners = new Set<() => void>();
const notifySessionChanged = () => { sessionGeneration++; for (const listener of sessionListeners) listener(); };

/** Facade de negócio. A seleção do transporte é definida no build, sem fallback de dados. */
export const db = {
  auth: {
    login: async (u: string, p: string, force?: boolean) => { const res = await call(a => a.auth.login(u, p, force)); if (res.success) notifySessionChanged(); return res; },
    logout: async (t?: string) => { try { return await call(a => a.auth.logout(t)); } finally { notifySessionChanged(); } },
    heartbeat: (t?: string) => call(a => a.auth.heartbeat(t)),
    current: () => call(a => a.auth.current()),
    onExpired: (listener: () => void) => { let cleanup: (() => void) | undefined; let active = true; void loadAdapter().then(a => { if (active) cleanup = a.auth.onExpired(listener); }); return () => { active = false; cleanup?.(); }; },
    onSessionChanged: (listener: () => void) => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); },
    sessionGeneration: () => sessionGeneration,
    invalidateSession: notifySessionChanged,
  },
  users: { list: (activity: DataActivity = 'user') => call(a => a.users.list(activity)), add: (u: Parameters<BusinessOperations['users']['add']>[0], t?: string) => call(a => a.users.add(u, t)), update: (id: number, u: Parameters<BusinessOperations['users']['update']>[1], t?: string) => call(a => a.users.update(id, u, t)), remove: (id: number, c?: Parameters<BusinessOperations['users']['remove']>[1], t?: string) => call(a => a.users.remove(id, c, t)) },
  customers: { list: (activity: DataActivity = 'user') => call(a => a.customers.list(activity)), add: (c: Parameters<BusinessOperations['customers']['add']>[0], t?: string) => call(a => a.customers.add(c, t)), update: (id: number, c: Parameters<BusinessOperations['customers']['update']>[1], t?: string) => call(a => a.customers.update(id, c, t)), remove: (id: number, c?: Parameters<BusinessOperations['customers']['remove']>[1], t?: string) => call(a => a.customers.remove(id, c, t)) },
  insumos: { list: (activity: DataActivity = 'user') => call(a => a.insumos.list(activity)), add: (n: string, t?: string) => call(a => a.insumos.add(n, t)), update: (id: number, n: string, t?: string) => call(a => a.insumos.update(id, n, t)), remove: (id: number, c?: Parameters<BusinessOperations['insumos']['remove']>[1], t?: string) => call(a => a.insumos.remove(id, c, t)) },
  formulas: { list: (query: Parameters<BusinessOperations['formulas']['list']>[0]) => call(a => a.formulas.list(query)), get: (id: number) => call(a => a.formulas.get(id)), summary: (month: number, year: number) => call(a => a.formulas.summary(month, year)), add: (f: Parameters<BusinessOperations['formulas']['add']>[0], t?: string) => call(a => a.formulas.add(f, t)), update: (id: number, f: Parameters<BusinessOperations['formulas']['update']>[1], t?: string) => call(a => a.formulas.update(id, f, t)), updateStatus: (id: number, s: string, t?: string) => call(a => a.formulas.updateStatus(id, s, t)), updateDeliveryStatus: (id: number, s: string, t?: string) => call(a => a.formulas.updateDeliveryStatus(id, s, t)), verify: (id: number, t?: string) => call(a => a.formulas.verify(id, t)), updateDeliveriesStatus: (ids: number[], s: string, t?: string) => call(a => a.formulas.updateDeliveriesStatus(ids, s, t)), remove: (id: number, c?: Parameters<BusinessOperations['formulas']['remove']>[1], t?: string) => call(a => a.formulas.remove(id, c, t)) },
  savedFormulas: { list: (activity: DataActivity = 'user') => call(a => a.savedFormulas.list(activity)), add: (f: Parameters<BusinessOperations['savedFormulas']['add']>[0], t?: string) => call(a => a.savedFormulas.add(f, t)), update: (id: number, f: Parameters<BusinessOperations['savedFormulas']['update']>[1], t?: string) => call(a => a.savedFormulas.update(id, f, t)), remove: (id: number, c?: Parameters<BusinessOperations['savedFormulas']['remove']>[1], t?: string) => call(a => a.savedFormulas.remove(id, c, t)) },
  logs: { list: (f?: Parameters<BusinessOperations['logs']['list']>[0], activity: DataActivity = 'user') => call(a => a.logs.list(f, activity)) },
  data: { onChanged: (cb: () => void) => { if (import.meta.env.VITE_APP_TRANSPORT !== 'desktop') return () => {}; let cleanup: (() => void) | undefined; void import('./ipcAdapter').then(m => { cleanup = m.ipcBusinessAdapter.data.onChanged(cb); }); return () => cleanup?.(); } },
};
