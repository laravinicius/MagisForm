import type {
  AdminCredentialsDto, BusinessOperations, CustomerInputDto, FormulaInputDto, FormulaListQueryDto, FormulaListPageDto, FormulaSummaryDto, FormulaDto,
  LogFiltersDto, OperationResultDto, SavedFormulaInputDto, SessionStateDto,
  UserInputDto,
} from '../../shared/contracts';
import type { DesktopConfigDto, DesktopConnectionResultDto } from './desktopTypes';

type UpdateStatus = 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';
export interface DesktopLoginResultDto extends OperationResultDto { sessionToken?: string }

interface ElectronApi {
  isWindowFullscreen(): Promise<boolean>; minimizeWindow(): Promise<void>; leaveWindowFullscreen(): Promise<void>; closeWindow(): Promise<void>;
  onWindowFullscreenChanged(cb: (fullscreen: boolean) => void): () => void;
  login(username: string, password: string, force?: boolean): Promise<DesktopLoginResultDto>;
  logout(token?: string): Promise<OperationResultDto>; sessionHeartbeat(token: string): Promise<SessionStateDto>;
  onAuthExpired(cb: () => void): () => void;
  listUsers(activity?: 'user' | 'passive'): ReturnType<BusinessOperations['users']['list']>; listCustomers(activity?: 'user' | 'passive'): ReturnType<BusinessOperations['customers']['list']>; listInsumos(activity?: 'user' | 'passive'): ReturnType<BusinessOperations['insumos']['list']>; listFormulas(query: FormulaListQueryDto, activity?: 'user' | 'passive'): Promise<FormulaListPageDto>; getFormula(id: number, activity?: 'user' | 'passive'): Promise<FormulaDto | null>; getFormulaSummary(month: number, year: number, activity?: 'user' | 'passive'): Promise<FormulaSummaryDto>; listSavedFormulas(activity?: 'user' | 'passive'): ReturnType<BusinessOperations['savedFormulas']['list']>;
  addUser(user: UserInputDto, token?: string): Promise<OperationResultDto>; updateUser(id: number, user: Partial<UserInputDto>, token?: string): Promise<OperationResultDto>; deleteUser(id: number, credentials?: AdminCredentialsDto, token?: string): Promise<OperationResultDto>;
  addCustomer(customer: CustomerInputDto, token?: string): Promise<OperationResultDto>; updateCustomer(id: number, customer: Partial<CustomerInputDto>, token?: string): Promise<OperationResultDto>; deleteCustomer(id: number, credentials?: AdminCredentialsDto, token?: string): Promise<OperationResultDto>;
  addInsumo(name: string, token?: string): Promise<OperationResultDto>; updateInsumo(id: number, name: string, token?: string): Promise<OperationResultDto>; deleteInsumo(id: number, credentials?: AdminCredentialsDto, token?: string): Promise<OperationResultDto>;
  addFormula(formula: FormulaInputDto, token?: string): Promise<OperationResultDto>; updateFormula(id: number, formula: FormulaInputDto, token?: string): Promise<OperationResultDto>; updateFormulaStatus(id: number, status: string, token?: string): Promise<OperationResultDto>; updateFormulaDeliveryStatus(id: number, status: string, token?: string): Promise<OperationResultDto>; verifyFormula(id: number, token?: string): Promise<OperationResultDto>; updateFormulasDeliveryStatus(ids: number[], status: string, token?: string): Promise<OperationResultDto>; deleteFormula(id: number, credentials?: AdminCredentialsDto, token?: string): Promise<OperationResultDto>;
  addSavedFormula(formula: SavedFormulaInputDto, token?: string): Promise<OperationResultDto>; updateSavedFormula(id: number, formula: SavedFormulaInputDto, token?: string): Promise<OperationResultDto>; deleteSavedFormula(id: number, credentials?: AdminCredentialsDto, token?: string): Promise<OperationResultDto>;
  listLogs(filters?: LogFiltersDto, activity?: 'user' | 'passive'): ReturnType<BusinessOperations['logs']['list']>;
  onDataChanged(cb: () => void): () => void;
  showMessageBox(options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }): Promise<number>;
  openWhatsApp(url: string): Promise<void>;
  getAppVersion(): Promise<string>; getUpdateStatus(): Promise<UpdateStatus>; checkForAppUpdates(): Promise<{ success: boolean; supported: boolean }>;
  installAppUpdate(token?: string): Promise<{ success: boolean }>; onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
  getConfig(): Promise<DesktopConfigDto>; saveConfig(config: DesktopConfigDto): Promise<DesktopConnectionResultDto>; testConnection(config?: DesktopConfigDto): Promise<DesktopConnectionResultDto>;
  getPublicBrand(): Promise<import('../../shared/contracts').PublicConfigDto | null>;
  onConfirmExit(cb: (context: { source: 'window-close' | 'logout' }) => void): () => void; confirmAppExit(token?: string): Promise<void>;
}

declare global { interface Window { electronAPI?: ElectronApi } }

export const isElectronAvailable = () => typeof window !== 'undefined' && Boolean(window.electronAPI);
const bridge = (): ElectronApi => {
  if (!isElectronAvailable()) throw new Error('Recurso disponível somente no aplicativo desktop.');
  return window.electronAPI!;
};

export const ipcBusinessAdapter = {
  auth: { login: (u, p, force) => bridge().login(u, p, force), logout: token => bridge().logout(token), heartbeat: token => bridge().sessionHeartbeat(token), current: async () => ({ success: false }), onExpired: listener => bridge().onAuthExpired(listener) },
  users: { list: activity => bridge().listUsers(activity), add: (u, token) => bridge().addUser(u, token), update: (id, u, token) => bridge().updateUser(id, u, token), remove: (id, creds, token) => bridge().deleteUser(id, creds, token) },
  customers: { list: activity => bridge().listCustomers(activity), add: (c, token) => bridge().addCustomer(c, token), update: (id, c, token) => bridge().updateCustomer(id, c, token), remove: (id, creds, token) => bridge().deleteCustomer(id, creds, token) },
  insumos: { list: activity => bridge().listInsumos(activity), add: (n, token) => bridge().addInsumo(n, token), update: (id, n, token) => bridge().updateInsumo(id, n, token), remove: (id, creds, token) => bridge().deleteInsumo(id, creds, token) },
  formulas: { list: (query, activity) => bridge().listFormulas(query, activity), get: (id, activity) => bridge().getFormula(id, activity), summary: (month, year, activity) => bridge().getFormulaSummary(month, year, activity), add: (f, token) => bridge().addFormula(f, token), update: (id, f, token) => bridge().updateFormula(id, f, token), updateStatus: (id, s, token) => bridge().updateFormulaStatus(id, s, token), updateDeliveryStatus: (id, s, token) => bridge().updateFormulaDeliveryStatus(id, s, token), verify: (id, token) => bridge().verifyFormula(id, token), updateDeliveriesStatus: (ids, s, token) => bridge().updateFormulasDeliveryStatus(ids, s, token), remove: (id, creds, token) => bridge().deleteFormula(id, creds, token) },
  savedFormulas: { list: activity => bridge().listSavedFormulas(activity), add: (f, token) => bridge().addSavedFormula(f, token), update: (id, f, token) => bridge().updateSavedFormula(id, f, token), remove: (id, creds, token) => bridge().deleteSavedFormula(id, creds, token) },
  logs: { list: (filters, activity) => bridge().listLogs(filters, activity) },
  data: { onChanged: cb => bridge().onDataChanged(cb) },
} as any;

export const ipcPlatformAdapter = {
  window: { isFullscreen: () => bridge().isWindowFullscreen(), minimize: () => bridge().minimizeWindow(), leaveFullscreen: () => bridge().leaveWindowFullscreen(), close: () => bridge().closeWindow(), onFullscreenChanged: (cb: (value: boolean) => void) => bridge().onWindowFullscreenChanged(cb) },
  app: { version: () => bridge().getAppVersion(), updateStatus: () => bridge().getUpdateStatus(), checkForUpdates: () => bridge().checkForAppUpdates(), installUpdate: (token?: string) => bridge().installAppUpdate(token), onUpdateStatus: (cb: (status: UpdateStatus) => void) => bridge().onUpdateStatus(cb), onConfirmExit: (cb: (ctx: { source: 'window-close' | 'logout' }) => void) => bridge().onConfirmExit(cb), confirmExit: (token?: string) => bridge().confirmAppExit(token) },
  setup: { getConfig: () => bridge().getConfig(), saveConfig: (cfg: DesktopConfigDto) => bridge().saveConfig(cfg), testConnection: (cfg?: DesktopConfigDto) => bridge().testConnection(cfg) },
  brand: { publicConfig: () => bridge().getPublicBrand() },
  dialogs: { showMessage: (options: Parameters<ElectronApi['showMessageBox']>[0]) => bridge().showMessageBox(options), openWhatsApp: (url: string) => bridge().openWhatsApp(url) },
};
