// Camada de serviço — comunicação exclusiva com o processo principal do Electron.

interface AdminCreds { username: string; password: string; }
type UpdateStatus = 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

declare global {
  interface Window {
    electronAPI: {
      isWindowFullscreen: () => Promise<boolean>; minimizeWindow: () => Promise<void>; leaveWindowFullscreen: () => Promise<void>; closeWindow: () => Promise<void>;
      onWindowFullscreenChanged: (cb: (fullscreen: boolean) => void) => () => void;
      login: (u: string, p: string, force?: boolean) => Promise<any>; logout: (token: string) => Promise<any>; sessionHeartbeat: (token: string) => Promise<any>;
      listUsers: () => Promise<any[]>; addUser: (u: any, t?: string) => Promise<any>; updateUser: (id: number, u: any, t?: string) => Promise<any>; deleteUser: (id: number, c?: AdminCreds, t?: string) => Promise<any>;
      listCustomers: () => Promise<any[]>; addCustomer: (c: any, t?: string) => Promise<any>; updateCustomer: (id: number, c: any, t?: string) => Promise<any>; deleteCustomer: (id: number, c?: AdminCreds, t?: string) => Promise<any>;
      listInsumos: () => Promise<any[]>; addInsumo: (n: string, t?: string) => Promise<any>; updateInsumo: (id: number, n: string, t?: string) => Promise<any>; deleteInsumo: (id: number, c?: AdminCreds, t?: string) => Promise<any>;
      listFormulas: () => Promise<any[]>; addFormula: (f: any, t?: string) => Promise<any>; updateFormula: (id: number, f: any, t?: string) => Promise<any>; updateFormulaStatus: (id: number, s: string, t?: string) => Promise<any>; updateFormulaDeliveryStatus: (id: number, s: string, t?: string) => Promise<any>; verifyFormula: (id: number, t?: string) => Promise<any>; updateFormulasDeliveryStatus: (ids: number[], s: string, t?: string) => Promise<any>; deleteFormula: (id: number, c?: AdminCreds, t?: string) => Promise<any>;
      listSavedFormulas: () => Promise<any[]>; addSavedFormula: (f: any, t?: string) => Promise<any>; updateSavedFormula: (id: number, f: any, t?: string) => Promise<any>; deleteSavedFormula: (id: number, c?: AdminCreds, t?: string) => Promise<any>;
      listLogs: (filters?: any) => Promise<{ rows: any[]; total: number }>; showMessageBox: (options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }) => Promise<any>; openWhatsApp: (url: string) => Promise<any>;
      onDataChanged: (cb: () => void) => () => void; getConfig: () => Promise<any>; saveConfig: (cfg: any) => Promise<any>; testConnection: () => Promise<any>;
      onConfirmExit: (cb: (context: { source: 'window-close' | 'logout' }) => void) => () => void; confirmAppExit: (token?: string) => Promise<void>;
      getAppVersion: () => Promise<string>; getUpdateStatus: () => Promise<UpdateStatus>; checkForAppUpdates: () => Promise<{ success: boolean; supported: boolean }>; installAppUpdate: (token?: string) => Promise<{ success: boolean }>;
      onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
    };
  }
}

const electron = () => window.electronAPI;

export const db = {
  window: {
    isFullscreen: () => electron().isWindowFullscreen(),
    minimize: () => electron().minimizeWindow(),
    leaveFullscreen: () => electron().leaveWindowFullscreen(),
    close: () => electron().closeWindow(),
    onFullscreenChanged: (cb: (fullscreen: boolean) => void) => electron().onWindowFullscreenChanged(cb),
  },
  auth: { login: (u: string, p: string, f?: boolean) => electron().login(u, p, f), logout: (t: string) => electron().logout(t), heartbeat: (t: string) => electron().sessionHeartbeat(t) },
  users: { list: () => electron().listUsers(), add: (u: any, t?: string) => electron().addUser(u, t), update: (id: number, u: any, t?: string) => electron().updateUser(id, u, t), remove: (id: number, c?: AdminCreds, t?: string) => electron().deleteUser(id, c, t) },
  customers: { list: () => electron().listCustomers(), add: (c: any, t?: string) => electron().addCustomer(c, t), update: (id: number, c: any, t?: string) => electron().updateCustomer(id, c, t), remove: (id: number, c?: AdminCreds, t?: string) => electron().deleteCustomer(id, c, t) },
  insumos: { list: () => electron().listInsumos(), add: (n: string, t?: string) => electron().addInsumo(n, t), update: (id: number, n: string, t?: string) => electron().updateInsumo(id, n, t), remove: (id: number, c?: AdminCreds, t?: string) => electron().deleteInsumo(id, c, t) },
  formulas: { list: () => electron().listFormulas(), add: (f: any, t?: string) => electron().addFormula(f, t), update: (id: number, f: any, t?: string) => electron().updateFormula(id, f, t), updateStatus: (id: number, s: string, t?: string) => electron().updateFormulaStatus(id, s, t), updateDeliveryStatus: (id: number, s: string, t?: string) => electron().updateFormulaDeliveryStatus(id, s, t), verify: (id: number, t?: string) => electron().verifyFormula(id, t), updateDeliveriesStatus: (ids: number[], s: string, t?: string) => electron().updateFormulasDeliveryStatus(ids, s, t), remove: (id: number, c?: AdminCreds, t?: string) => electron().deleteFormula(id, c, t) },
  savedFormulas: { list: () => electron().listSavedFormulas(), add: (f: any, t?: string) => electron().addSavedFormula(f, t), update: (id: number, f: any, t?: string) => electron().updateSavedFormula(id, f, t), remove: (id: number, c?: AdminCreds, t?: string) => electron().deleteSavedFormula(id, c, t) },
  logs: { list: (filters?: any) => electron().listLogs(filters) },
  data: { onChanged: (cb: () => void) => electron().onDataChanged(cb) },
  config: { get: () => electron().getConfig(), save: (c: any) => electron().saveConfig(c), test: () => electron().testConnection() },
  app: { onConfirmExit: (cb: (context: { source: 'window-close' | 'logout' }) => void) => electron().onConfirmExit(cb), confirmExit: (token?: string) => electron().confirmAppExit(token), version: () => electron().getAppVersion(), updateStatus: () => electron().getUpdateStatus(), checkForUpdates: () => electron().checkForAppUpdates(), onUpdateStatus: (cb: (status: UpdateStatus) => void) => electron().onUpdateStatus(cb), installUpdate: (token?: string) => electron().installAppUpdate(token) },
};
