import { contextBridge, ipcRenderer } from 'electron';
import type { AdminCredentialsDto, CustomerInputDto, FormulaInputDto, LogFiltersDto, SavedFormulaInputDto, UserInputDto } from '../shared/contracts';
import type { DesktopConfigDto } from '../src/services/desktopTypes';
import type { PublicConfigDto } from '../shared/contracts';

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
  logout: (token?: string) => ipcRenderer.invoke('auth:logout', token),
  sessionHeartbeat: (token: string) => ipcRenderer.invoke('session:heartbeat', token),
  onAuthExpired: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('auth:expired', listener);
    return () => ipcRenderer.removeListener('auth:expired', listener);
  },

  // Usuários
  listUsers:   (activity?: 'user' | 'passive') => ipcRenderer.invoke('users:list', activity),
  addUser:     (u: UserInputDto, sessionToken?: string) => ipcRenderer.invoke('users:add', u, sessionToken),
  updateUser:  (id: number, u: Partial<UserInputDto>, sessionToken?: string) => ipcRenderer.invoke('users:update', id, u, sessionToken),
  deleteUser:  (id: number, adminCreds?: AdminCredentialsDto, sessionToken?: string) => ipcRenderer.invoke('users:delete', id, adminCreds, sessionToken),

  // Clientes
  listCustomers:   (activity?: 'user' | 'passive') => ipcRenderer.invoke('customers:list', activity),
  addCustomer:     (c: CustomerInputDto, sessionToken?: string) => ipcRenderer.invoke('customers:add', c, sessionToken),
  updateCustomer:  (id: number, c: Partial<CustomerInputDto>, sessionToken?: string) => ipcRenderer.invoke('customers:update', id, c, sessionToken),
  deleteCustomer:  (id: number, adminCreds?: AdminCredentialsDto, sessionToken?: string) => ipcRenderer.invoke('customers:delete', id, adminCreds, sessionToken),

  // Insumos
  listInsumos:   (activity?: 'user' | 'passive') => ipcRenderer.invoke('insumos:list', activity),
  addInsumo:     (name: string, sessionToken?: string) => ipcRenderer.invoke('insumos:add', name, sessionToken),
  updateInsumo:  (id: number, name: string, sessionToken?: string) => ipcRenderer.invoke('insumos:update', id, name, sessionToken),
  deleteInsumo:  (id: number, adminCreds?: AdminCredentialsDto, sessionToken?: string) => ipcRenderer.invoke('insumos:delete', id, adminCreds, sessionToken),

  // Fórmulas
  listFormulas:         (query: import('../shared/contracts').FormulaListQueryDto, activity?: 'user' | 'passive') => ipcRenderer.invoke('formulas:list', query, activity),
  getFormula:           (id: number, activity?: 'user' | 'passive') => ipcRenderer.invoke('formulas:get', id, activity),
  getFormulaSummary:    (month: number, year: number, activity?: 'user' | 'passive') => ipcRenderer.invoke('formulas:summary', month, year, activity),
  addFormula:           (f: FormulaInputDto, sessionToken?: string)       => ipcRenderer.invoke('formulas:add', f, sessionToken),
  updateFormula:        (id: number, f: FormulaInputDto, sessionToken?: string) => ipcRenderer.invoke('formulas:update', id, f, sessionToken),
  updateFormulaStatus:  (id: number, s: string, sessionToken?: string)   => ipcRenderer.invoke('formulas:update-status', id, s, sessionToken),
  updateFormulaDeliveryStatus: (id: number, s: string, sessionToken?: string) => ipcRenderer.invoke('formulas:update-delivery-status', id, s, sessionToken),
  verifyFormula: (id: number, sessionToken?: string) => ipcRenderer.invoke('formulas:verify', id, sessionToken),
  updateFormulasDeliveryStatus: (ids: number[], s: string, sessionToken?: string) => ipcRenderer.invoke('formulas:update-delivery-status-batch', ids, s, sessionToken),
  deleteFormula:        (id: number, adminCreds?: AdminCredentialsDto, sessionToken?: string) => ipcRenderer.invoke('formulas:delete', id, adminCreds, sessionToken),

  // Fórmulas Salvas
  listSavedFormulas:   (activity?: 'user' | 'passive') => ipcRenderer.invoke('savedFormulas:list', activity),
  addSavedFormula:     (f: SavedFormulaInputDto, sessionToken?: string) => ipcRenderer.invoke('savedFormulas:add', f, sessionToken),
  updateSavedFormula:  (id: number, f: SavedFormulaInputDto, sessionToken?: string) => ipcRenderer.invoke('savedFormulas:update', id, f, sessionToken),
  deleteSavedFormula:  (id: number, adminCreds?: AdminCredentialsDto, sessionToken?: string) => ipcRenderer.invoke('savedFormulas:delete', id, adminCreds, sessionToken),

  // Logs de auditoria
  listLogs: (filters?: LogFiltersDto, activity?: 'user' | 'passive') => ipcRenderer.invoke('logs:list', filters, activity),
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
  getPublicBrand: (): Promise<PublicConfigDto | null> => ipcRenderer.invoke('brand:get-public'),
  getConfig:       () => ipcRenderer.invoke('config:get'),
  saveConfig:      (cfg: DesktopConfigDto) => ipcRenderer.invoke('config:save', cfg),
  testConnection:  (cfg?: DesktopConfigDto) => ipcRenderer.invoke('config:test', cfg),

  // Confirmação de saída
  onConfirmExit: (cb: (context: { source: 'window-close' | 'logout' }) => void) => {
    const listener = (_: unknown, context: { source: 'window-close' | 'logout' }) => cb(context);
    ipcRenderer.on('app:confirm-exit', listener);
    return () => ipcRenderer.removeListener('app:confirm-exit', listener);
  },
  confirmAppExit: (token?: string) => ipcRenderer.invoke('app:exit-confirmed', token),
});
