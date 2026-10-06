import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Controles da janela em tela cheia
  isWindowFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  leaveWindowFullscreen: () => ipcRenderer.invoke('window:leave-fullscreen'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowFullscreenChanged: (cb: (fullscreen: boolean) => void) => {
    const listener = (_: unknown, fullscreen: boolean) => cb(fullscreen);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },

  // Auth
  login: (username: string, password: string, force: boolean = false) =>
    ipcRenderer.invoke('auth:login', username, password, force),
  logout: (token: string) => ipcRenderer.invoke('auth:logout', token),
  sessionHeartbeat: (token: string) => ipcRenderer.invoke('session:heartbeat', token),

  // Usuários
  listUsers:   ()    => ipcRenderer.invoke('users:list'),
  addUser:     (u: any, sessionToken?: string) => ipcRenderer.invoke('users:add', u, sessionToken),
  updateUser:  (id: number, u: any, sessionToken?: string) => ipcRenderer.invoke('users:update', id, u, sessionToken),
  deleteUser:  (id: number, adminCreds?: { username: string; password: string }, sessionToken?: string) => ipcRenderer.invoke('users:delete', id, adminCreds, sessionToken),

  // Clientes
  listCustomers:   ()              => ipcRenderer.invoke('customers:list'),
  addCustomer:     (c: any, sessionToken?: string)        => ipcRenderer.invoke('customers:add', c, sessionToken),
  updateCustomer:  (id: number, c: any, sessionToken?: string) => ipcRenderer.invoke('customers:update', id, c, sessionToken),
  deleteCustomer:  (id: number, adminCreds?: { username: string; password: string }, sessionToken?: string) => ipcRenderer.invoke('customers:delete', id, adminCreds, sessionToken),

  // Insumos
  listInsumos:   ()           => ipcRenderer.invoke('insumos:list'),
  addInsumo:     (name: string, sessionToken?: string) => ipcRenderer.invoke('insumos:add', name, sessionToken),
  updateInsumo:  (id: number, name: string, sessionToken?: string) => ipcRenderer.invoke('insumos:update', id, name, sessionToken),
  deleteInsumo:  (id: number, adminCreds?: { username: string; password: string }, sessionToken?: string) => ipcRenderer.invoke('insumos:delete', id, adminCreds, sessionToken),

  // Fórmulas
  listFormulas:         ()                        => ipcRenderer.invoke('formulas:list'),
  addFormula:           (f: any, sessionToken?: string)                  => ipcRenderer.invoke('formulas:add', f, sessionToken),
  updateFormula:        (id: number, f: any, sessionToken?: string)      => ipcRenderer.invoke('formulas:update', id, f, sessionToken),
  updateFormulaStatus:  (id: number, s: string, sessionToken?: string)   => ipcRenderer.invoke('formulas:update-status', id, s, sessionToken),
  updateFormulaDeliveryStatus: (id: number, s: string, sessionToken?: string) => ipcRenderer.invoke('formulas:update-delivery-status', id, s, sessionToken),
  verifyFormula: (id: number, sessionToken?: string) => ipcRenderer.invoke('formulas:verify', id, sessionToken),
  updateFormulasDeliveryStatus: (ids: number[], s: string, sessionToken?: string) => ipcRenderer.invoke('formulas:update-delivery-status-batch', ids, s, sessionToken),
  deleteFormula:        (id: number, adminCreds?: { username: string; password: string }, sessionToken?: string) => ipcRenderer.invoke('formulas:delete', id, adminCreds, sessionToken),

  // Fórmulas Salvas
  listSavedFormulas:   ()                => ipcRenderer.invoke('savedFormulas:list'),
  addSavedFormula:     (f: any, sessionToken?: string)          => ipcRenderer.invoke('savedFormulas:add', f, sessionToken),
  updateSavedFormula:  (id: number, f: any, sessionToken?: string) => ipcRenderer.invoke('savedFormulas:update', id, f, sessionToken),
  deleteSavedFormula:  (id: number, adminCreds?: { username: string; password: string }, sessionToken?: string) => ipcRenderer.invoke('savedFormulas:delete', id, adminCreds, sessionToken),

  // Logs de auditoria
  listLogs: (filters?: any) => ipcRenderer.invoke('logs:list', filters),
  showMessageBox: (options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }) =>
    ipcRenderer.invoke('app:show-message-box', options),
  openWhatsApp: (url: string) => ipcRenderer.invoke('app:open-whatsapp', url),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  checkForAppUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installAppUpdate: (sessionToken?: string) => ipcRenderer.invoke('app:install-update', sessionToken),
  onUpdateStatus: (cb: (status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error') => void) => {
    const listener = (_: unknown, status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error') => cb(status);
    ipcRenderer.on('app:update-status', listener);
    return () => ipcRenderer.removeListener('app:update-status', listener);
  },

  // Atualização ao vivo — avisa quando os dados mudam no servidor
  onDataChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('data:changed', listener);
    return () => ipcRenderer.removeListener('data:changed', listener);
  },

  // Configurações
  getConfig:       () => ipcRenderer.invoke('config:get'),
  saveConfig:      (cfg: any) => ipcRenderer.invoke('config:save', cfg),
  testConnection:  () => ipcRenderer.invoke('config:test'),

  // Confirmação de saída
  onConfirmExit: (cb: (context: { source: 'window-close' | 'logout' }) => void) => {
    const listener = (_: any, context: { source: 'window-close' | 'logout' }) => cb(context);
    ipcRenderer.on('app:confirm-exit', listener);
    return () => ipcRenderer.removeListener('app:confirm-exit', listener);
  },
  confirmAppExit: (token?: string) => ipcRenderer.invoke('app:exit-confirmed', token),
});
