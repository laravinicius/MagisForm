import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import electronUpdater from 'electron-updater';
import { Db } from '../core/db';
import { BRAND, COLORS } from '../config/branding';
import { assertRemoteConfigAccess, clearRemoteSession, getRemotePublicConfig, invokeRemote, testDesktopConnection, validateServerUrl } from './remoteAdapter';
import type { DesktopConfigDto } from '../src/services/desktopTypes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { autoUpdater } = electronUpdater;

app.setName('MagisForm');
const userDataPath = path.join(app.getPath('appData'), 'MagisForm');
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
app.setPath('sessionData', userDataPath);

// ─── Master key (modo setup) ─────────────────────────────────────────────────
const MASTER_USERNAME = 'admin';
const MASTER_PASSWORD = 'admin123';
const hasMasterSetupCredentials = true;
const setupModeWindows = new Set<number>();
const sessionByWindow = new Map<number, string>();

// ─── Config ───────────────────────────────────────────────────────────────────

const configPath = path.join(app.getPath('userData'), 'config.json');

interface DbConfig extends DesktopConfigDto {}

let dbConfig: DbConfig = {
  connectionMode: 'local', serverUrl: '',
  host: 'localhost', port: 3306, user: 'magisform_app', password: 'magisform_dev', database: 'magisform',
};

if (fs.existsSync(configPath)) {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    dbConfig = { ...dbConfig, ...saved, connectionMode: saved.connectionMode === 'remote' ? 'remote' : 'local' };
  }
  catch (e) { console.error('Erro ao carregar config:', e); }
}

// ─── Pool + Db ────────────────────────────────────────────────────────────────

let pool: mysql.Pool | null = null;
const db = new Db();
db.enforceAuthentication();

const rawHandle = ipcMain.handle.bind(ipcMain);
const protectedChannels = /^(users|customers|insumos|formulas|savedFormulas|logs|config):/;
function handle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  return rawHandle(channel, async (event, ...args) => {
    if (channel === 'brand:get-public') {
      if (dbConfig.connectionMode === 'local') return null;
      return getRemotePublicConfig(dbConfig, app.isPackaged);
    }
    if (dbConfig.connectionMode === 'remote') {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error('Janela desktop indisponível.');
      if (channel.startsWith('config:')) {
        await assertRemoteConfigAccess(event.sender.id, dbConfig, app.isPackaged);
        if (channel === 'config:get') {
          const { password: _password, ...safe } = dbConfig;
          return safe;
        }
        if (channel === 'config:test') return testDesktopConnection((args[0] as DbConfig | undefined) ?? dbConfig, app.isPackaged);
        if (channel === 'config:save') return saveDesktopConfig(args[0] as Partial<DbConfig>, event.sender.id);
      }
      const result = await invokeRemote(window, dbConfig, channel, args, app.isPackaged);
      if (/^(users|customers|insumos|formulas|savedFormulas):(add|update|delete)|^formulas:(update-status|update-delivery-status|verify|update-delivery-status-batch)$/.test(channel) && (result as { success?: boolean } | null)?.success) notifyDataChanged();
      return result;
    }
    if (!protectedChannels.test(channel)) return listener(event, ...args);
    if (setupModeWindows.has(event.sender.id)) {
      if (channel.startsWith('config:')) return db.withSetupContext(() => listener(event, ...args));
      if (channel === 'users:add' || channel === 'users:update') {
        return db.withSetupContext(() => listener(event, ...args));
      }
      throw new Error('O modo de configuração não tem acesso a dados de negócio.');
    }
    return db.withSessionContext(sessionByWindow.get(event.sender.id), async () => {
      if (channel.startsWith('config:')) await db.assertPrivilegedSession();
      return listener(event, ...args);
    });
  });
}

const initPool = () => {
  if (pool) pool.end().catch(() => {});
  pool = mysql.createPool({
    host: dbConfig.host, port: dbConfig.port, user: dbConfig.user,
    password: dbConfig.password, database: dbConfig.database,
    waitForConnections: true, connectionLimit: 10, connectTimeout: 5000,
    dateStrings: true,
  });
  pool.on('connection', (conn) => {
    (conn as any).query("SET time_zone = '-03:00'", () => {});
  });
  db.setPool(pool);
};

if (dbConfig.connectionMode === 'local') initPool();

async function saveDesktopConfig(newConfig: Partial<DbConfig>, windowId: number) {
  const next = { ...dbConfig, ...newConfig, password: newConfig.password || dbConfig.password, connectionMode: newConfig.connectionMode === 'remote' ? 'remote' : (newConfig.connectionMode === 'local' ? 'local' : dbConfig.connectionMode) };
  if (next.connectionMode === 'remote') {
    try { next.serverUrl = validateServerUrl(next.serverUrl, !app.isPackaged); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : 'URL remota inválida.' }; }
  }
  const restartRequired = next.connectionMode !== dbConfig.connectionMode || (next.connectionMode === 'remote' && next.serverUrl !== dbConfig.serverUrl);
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  if (restartRequired) {
    if (dbConfig.connectionMode === 'remote') {
      const win = BrowserWindow.fromId(windowId);
      if (win) await invokeRemote(win, dbConfig, 'auth:logout', [], app.isPackaged).catch(() => {});
      clearRemoteSession(windowId);
    } else {
      const token = sessionByWindow.get(windowId);
      if (token) await db.revokeSession(token).catch(() => {});
      sessionByWindow.delete(windowId);
    }
    pendingExitConfirm = true;
    setTimeout(() => { app.relaunch(); app.quit(); }, 100);
    return { success: true, restartRequired: true };
  }
  dbConfig = next;
  if (dbConfig.connectionMode === 'local') initPool();
  return { success: true, restartRequired: false };
}

// ─── IPC: Auth ────────────────────────────────────────────────────────────────

handle('auth:login', async (event, username: string, password: string, force = false) => {
  if (hasMasterSetupCredentials && username === MASTER_USERNAME && password === MASTER_PASSWORD) {
    sessionByWindow.delete(event.sender.id);
    await db.withSetupContext(() => db.logAction('Configuração', 'login', 'system', null,
      'Login no modo configuração (segredo omitido).'));
    setupModeWindows.add(event.sender.id);
    return {
      success: true, setupMode: true,
      user: { id: 0, name: 'Configuração', username: MASTER_USERNAME, role: 'admin' },
    };
  }
  setupModeWindows.delete(event.sender.id);
  const result = await db.login(username, password, force);
  if (result.success && result.sessionToken) sessionByWindow.set(event.sender.id, result.sessionToken);
  else sessionByWindow.delete(event.sender.id);
  return result;
});

handle('auth:logout', async (event, token?: string) => {
  if (setupModeWindows.has(event.sender.id)) {
    if (token) return { success: false, error: 'Token inválido no modo de configuração.' };
    await db.withSetupContext(() => db.logAction('Configuração', 'logout', 'system', null,
      'Saída do modo configuração.'));
    setupModeWindows.delete(event.sender.id);
    return { success: true };
  }
  if (!token || sessionByWindow.get(event.sender.id) !== token) return { success: false, error: 'Sessão inválida.' };
  sessionByWindow.delete(event.sender.id);
  setupModeWindows.delete(event.sender.id);
  await db.revokeSession(token);
  return { success: true };
});

handle('session:heartbeat', async (_, token: string) => {
  return await db.heartbeat(token);
});

// Limpa sessões órfãs (app fechado sem logout / queda de energia)
setInterval(() => { if (dbConfig.connectionMode === 'local') db.cleanupStaleSessions().catch(() => {}); }, 60_000);

// ─── Usuários ────────────────────────────────────────────────────────────────

handle('users:list',   ()          => db.listUsers());
handle('users:add',    async (event, u, sessionToken)      => { const r = await db.addUser(u, sessionToken, setupModeWindows.has(event.sender.id)); if (r?.success) notifyDataChanged(); return r; });
handle('users:update', async (event, id, u, sessionToken)  => { const r = await db.updateUser(id, u, sessionToken, setupModeWindows.has(event.sender.id)); if (r?.success) notifyDataChanged(); return r; });
handle('users:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteUser(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Clientes ────────────────────────────────────────────────────────────────

handle('customers:list',   ()           => db.listCustomers());
handle('customers:add',    async (_, c, sessionToken)        => { const r = await db.addCustomer(c, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('customers:update', async (_, id, c, sessionToken)    => { const r = await db.updateCustomer(id, c, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('customers:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteCustomer(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Insumos ─────────────────────────────────────────────────────────────────

handle('insumos:list',   ()        => db.listInsumos());
handle('insumos:add',    async (_, name, sessionToken) => { const r = await db.addInsumo(name, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('insumos:update', async (_, id, name, sessionToken) => { const r = await db.updateInsumo(id, name, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('insumos:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteInsumo(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Fórmulas ────────────────────────────────────────────────────────────────

handle('formulas:list',          (_, query)       => db.listFormulas(query));
handle('formulas:get',           (_, id)          => db.getFormula(id));
handle('formulas:summary',       (_, month, year) => db.getFormulaSummary(month, year));
handle('formulas:add',           async (_, f, sessionToken)          => { const r = await db.addFormula(f, sessionToken); notifyDataChanged(); return r; });
handle('formulas:update',        async (_, id, f, sessionToken)      => { const r = await db.updateFormula(id, f, sessionToken); notifyDataChanged(); return r; });
handle('formulas:update-status', async (_, id, status, sessionToken) => { const r = await db.updateFormulaStatus(id, status, sessionToken); notifyDataChanged(); return r; });
handle('formulas:update-delivery-status', async (_, id, deliveryStatus, sessionToken) => { const r = await db.updateFormulaDeliveryStatus(id, deliveryStatus, sessionToken); notifyDataChanged(); return r; });
handle('formulas:verify', async (_, id, sessionToken) => { const r = await db.verifyFormula(id, sessionToken); notifyDataChanged(); return r; });
handle('formulas:update-delivery-status-batch', async (_, ids, deliveryStatus, sessionToken) => { const r = await db.updateFormulasDeliveryStatus(ids, deliveryStatus, sessionToken); notifyDataChanged(); return r; });
handle('formulas:delete',        async (_, id, adminCreds, sessionToken) => { const r = await db.deleteFormula(id, adminCreds, sessionToken); notifyDataChanged(); return r; });

// ─── Fórmulas Salvas ─────────────────────────────────────────────────────────

handle('savedFormulas:list',   ()           => db.listSavedFormulas());
handle('savedFormulas:add',    async (_, f, sessionToken)       => { const r = await db.addSavedFormula(f, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('savedFormulas:update', async (_, id, f, sessionToken)   => { const r = await db.updateSavedFormula(id, f, sessionToken); if (r?.success) notifyDataChanged(); return r; });
handle('savedFormulas:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteSavedFormula(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Logs de auditoria ───────────────────────────────────────────────────────

handle('logs:list', (_, filters) => db.listLogs(filters));

handle('app:show-message-box', async (_, options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }) => {
  return dialog.showMessageBox({
    type: options.type ?? 'info',
    title: options.title ?? 'MagisForm',
    message: options.message,
  });
});

handle('app:open-whatsapp', async (_, url: string) => {
  if (!url.startsWith('whatsapp://send?')) throw new Error('URL do WhatsApp inválida.');
  await shell.openExternal(url);
  return { success: true };
});

// ─── Configurações ───────────────────────────────────────────────────────────

handle('config:get', () => {
  const { password: _p, ...safe } = dbConfig;
  return safe;
});

handle('config:save', (event, newConfig: Partial<DbConfig>) => {
  return saveDesktopConfig(newConfig, event.sender.id);
});

handle('config:test', async (_, candidate?: DbConfig) => {
  return testDesktopConnection(candidate ?? dbConfig, app.isPackaged);
});

// ─── Janela ───────────────────────────────────────────────────────────────────

// Avisa todas as janelas abertas que os dados mudaram (atualização ao vivo)
const notifyDataChanged = () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('data:changed');
  }
};

handle('window:is-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false);
handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
handle('window:leave-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.setFullScreen(false));
handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

let pendingExitConfirm = false;
let updateStatus: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' = 'checking';
let updateInstallRequested = false;
let updateSessionToken: string | undefined;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

const broadcastUpdateStatus = () => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('app:update-status', updateStatus);
};

autoUpdater.on('checking-for-update', () => { updateStatus = 'checking'; broadcastUpdateStatus(); });
autoUpdater.on('update-available', () => { updateStatus = 'available'; broadcastUpdateStatus(); });
autoUpdater.on('download-progress', () => { updateStatus = 'downloading'; broadcastUpdateStatus(); });
autoUpdater.on('update-not-available', () => { updateStatus = 'not-available'; updateInstallRequested = false; updateSessionToken = undefined; broadcastUpdateStatus(); });
autoUpdater.on('error', (error) => { console.error('Erro ao atualizar o aplicativo:', error); updateStatus = 'error'; updateInstallRequested = false; updateSessionToken = undefined; broadcastUpdateStatus(); });
autoUpdater.on('update-downloaded', () => {
  updateStatus = 'downloaded';
  broadcastUpdateStatus();
});

handle('app:get-version', () => app.getVersion());
handle('app:get-update-status', () => updateStatus);
handle('app:check-for-updates', async () => {
  if (!app.isPackaged || process.platform !== 'win32') {
    updateStatus = 'not-available';
    broadcastUpdateStatus();
    return { success: false, supported: false };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { success: true, supported: true };
  } catch (error) {
    console.error('Falha ao verificar atualizações:', error);
    updateStatus = 'error';
    broadcastUpdateStatus();
    return { success: false, supported: true };
  }
});
handle('app:install-update', async (event, token?: string) => {
  updateInstallRequested = true;
  updateSessionToken = token;
  if (updateStatus === 'downloaded') {
    if (dbConfig.connectionMode === 'remote') {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) await invokeRemote(win, dbConfig, 'auth:logout', [], app.isPackaged).catch(() => {});
      clearRemoteSession(event.sender.id);
    } else if (updateSessionToken) await db.revokeSession(updateSessionToken).catch(() => {});
    pendingExitConfirm = true;
    autoUpdater.quitAndInstall();
    return { success: true };
  }
  if (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'checking') {
    updateStatus = 'downloading';
    broadcastUpdateStatus();
    return { success: true };
  }
  updateInstallRequested = false;
  updateSessionToken = undefined;
  return { success: false };
});

const createWindow = () => {
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../public/icon.ico')
    : path.join(__dirname, '../dist/icon.ico');

  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: BRAND.windowTitle,
    icon: appIcon,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: COLORS.secondary,
      symbolColor: '#FFFFFF',
      height: 30,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const webContentsId = win.webContents.id;
  win.on('closed', () => {
    setupModeWindows.delete(webContentsId);
    sessionByWindow.delete(webContentsId);
    if (dbConfig.connectionMode === 'remote') {
      void invokeRemote(win, dbConfig, 'auth:logout', [], app.isPackaged).catch(() => {});
      clearRemoteSession(webContentsId);
    }
  });
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen-changed', true));
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen-changed', false));

  win.on('close', (event) => {
    if (!pendingExitConfirm && BrowserWindow.getAllWindows().length === 1) {
      event.preventDefault();
      win.webContents.send('app:confirm-exit', { source: 'window-close' });
    } else if (pendingExitConfirm) {
      pendingExitConfirm = false;
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

handle('app:exit-confirmed', async (event, token?: string) => {
  const wasSetup = setupModeWindows.has(event.sender.id);
  const boundToken = sessionByWindow.get(event.sender.id);
  if (token && token === boundToken) {
    sessionByWindow.delete(event.sender.id);
    await db.revokeSession(token).catch(() => {});
  } else if (token) {
    if (!(dbConfig.connectionMode === 'remote' && token === 'remote-session')) return { success: false, error: 'Sessão inválida.' };
  }
  if (dbConfig.connectionMode === 'remote') {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) await invokeRemote(win, dbConfig, 'auth:logout', [], app.isPackaged).catch(() => {});
    clearRemoteSession(event.sender.id);
  }
  if (wasSetup) await db.withSetupContext(() => db.logAction('Configuração', 'logout', 'system', null,
    'Saída do modo configuração.'));
  setupModeWindows.delete(event.sender.id);
  pendingExitConfirm = true;
  for (const win of BrowserWindow.getAllWindows()) {
    win.destroy();
  }
});

app.on('before-quit', (event) => {
  if (!pendingExitConfirm && BrowserWindow.getAllWindows().length > 0) {
    event.preventDefault();
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.send('app:confirm-exit', { source: 'window-close' });
  }
});

app.on('ready', () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.magisform.app');
  }
  createWindow();
  if (app.isPackaged && process.platform === 'win32') {
    autoUpdater.checkForUpdates().catch((error) => console.error('Falha ao verificar atualizações:', error));
  } else {
    updateStatus = 'not-available';
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
