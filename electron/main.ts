import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import electronUpdater from 'electron-updater';
import { Db } from './db';
import { formatDbError } from './dbError';
import { BRAND, COLORS } from '../config/branding';

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

// ─── Config ───────────────────────────────────────────────────────────────────

const configPath = path.join(app.getPath('userData'), 'config.json');

interface DbConfig {
  host: string; port: number; user: string; password: string; database: string;
}

let dbConfig: DbConfig = {
  host: 'localhost', port: 3306, user: 'magisform_app', password: 'magisform_dev', database: 'magisform',
};

if (fs.existsSync(configPath)) {
  try { dbConfig = { ...dbConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) }; }
  catch (e) { console.error('Erro ao carregar config:', e); }
}

// ─── Pool + Db ────────────────────────────────────────────────────────────────

let pool: mysql.Pool | null = null;
const db = new Db();

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

initPool();

// ─── IPC: Auth ────────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (event, username: string, password: string, force = false) => {
  if (hasMasterSetupCredentials && username === MASTER_USERNAME && password === MASTER_PASSWORD) {
    setupModeWindows.add(event.sender.id);
    await db.logAction('Configuração', 'login', 'system', null, 'Login no modo configuração (admin/admin123).');
    return {
      success: true, setupMode: true,
      user: { id: 0, name: 'Configuração', username: MASTER_USERNAME, role: 'admin' },
    };
  }
  setupModeWindows.delete(event.sender.id);
  return await db.login(username, password, force);
});

ipcMain.handle('auth:logout', async (event, token: string) => {
  setupModeWindows.delete(event.sender.id);
  await db.revokeSession(token);
  return { success: true };
});

ipcMain.handle('session:heartbeat', async (_, token: string) => {
  return await db.heartbeat(token);
});

// Limpa sessões órfãs (app fechado sem logout / queda de energia)
setInterval(() => { db.cleanupStaleSessions().catch(() => {}); }, 60_000);

// ─── Usuários ────────────────────────────────────────────────────────────────

ipcMain.handle('users:list',   ()          => db.listUsers());
ipcMain.handle('users:add',    async (event, u, sessionToken)      => { const r = await db.addUser(u, sessionToken, setupModeWindows.has(event.sender.id)); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('users:update', async (event, id, u, sessionToken)  => { const r = await db.updateUser(id, u, sessionToken, setupModeWindows.has(event.sender.id)); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('users:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteUser(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Clientes ────────────────────────────────────────────────────────────────

ipcMain.handle('customers:list',   ()           => db.listCustomers());
ipcMain.handle('customers:add',    async (_, c, sessionToken)        => { const r = await db.addCustomer(c, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('customers:update', async (_, id, c, sessionToken)    => { const r = await db.updateCustomer(id, c, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('customers:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteCustomer(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Insumos ─────────────────────────────────────────────────────────────────

ipcMain.handle('insumos:list',   ()        => db.listInsumos());
ipcMain.handle('insumos:add',    async (_, name, sessionToken) => { const r = await db.addInsumo(name, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('insumos:update', async (_, id, name, sessionToken) => { const r = await db.updateInsumo(id, name, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('insumos:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteInsumo(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Fórmulas ────────────────────────────────────────────────────────────────

ipcMain.handle('formulas:list',          ()              => db.listFormulas());
ipcMain.handle('formulas:add',           async (_, f, sessionToken)          => { const r = await db.addFormula(f, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:update',        async (_, id, f, sessionToken)      => { const r = await db.updateFormula(id, f, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:update-status', async (_, id, status, sessionToken) => { const r = await db.updateFormulaStatus(id, status, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:update-delivery-status', async (_, id, deliveryStatus, sessionToken) => { const r = await db.updateFormulaDeliveryStatus(id, deliveryStatus, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:verify', async (_, id, sessionToken) => { const r = await db.verifyFormula(id, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:update-delivery-status-batch', async (_, ids, deliveryStatus, sessionToken) => { const r = await db.updateFormulasDeliveryStatus(ids, deliveryStatus, sessionToken); notifyDataChanged(); return r; });
ipcMain.handle('formulas:delete',        async (_, id, adminCreds, sessionToken) => { const r = await db.deleteFormula(id, adminCreds, sessionToken); notifyDataChanged(); return r; });

// ─── Fórmulas Salvas ─────────────────────────────────────────────────────────

ipcMain.handle('savedFormulas:list',   ()           => db.listSavedFormulas());
ipcMain.handle('savedFormulas:add',    async (_, f, sessionToken)       => { const r = await db.addSavedFormula(f, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('savedFormulas:update', async (_, id, f, sessionToken)   => { const r = await db.updateSavedFormula(id, f, sessionToken); if (r?.success) notifyDataChanged(); return r; });
ipcMain.handle('savedFormulas:delete', async (_, id, adminCreds, sessionToken) => { const r = await db.deleteSavedFormula(id, adminCreds, sessionToken); if (r?.success) notifyDataChanged(); return r; });

// ─── Logs de auditoria ───────────────────────────────────────────────────────

ipcMain.handle('logs:list', (_, filters) => db.listLogs(filters));

ipcMain.handle('app:show-message-box', async (_, options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }) => {
  return dialog.showMessageBox({
    type: options.type ?? 'info',
    title: options.title ?? 'MagisForm',
    message: options.message,
  });
});

ipcMain.handle('app:open-whatsapp', async (_, url: string) => {
  if (!url.startsWith('whatsapp://send?')) throw new Error('URL do WhatsApp inválida.');
  await shell.openExternal(url);
  return { success: true };
});

// ─── Configurações ───────────────────────────────────────────────────────────

ipcMain.handle('config:get', () => {
  const { password: _p, ...safe } = dbConfig;
  return safe;
});

ipcMain.handle('config:save', (_, newConfig: Partial<DbConfig>) => {
  dbConfig = { ...dbConfig, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(dbConfig, null, 2));
initPool();
  return { success: true };
});

ipcMain.handle('config:test', async () => {
  try {
    await pool!.query('SELECT 1');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: formatDbError(e) };
  }
});

// ─── Janela ───────────────────────────────────────────────────────────────────

// Avisa todas as janelas abertas que os dados mudaram (atualização ao vivo)
const notifyDataChanged = () => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('data:changed');
  }
};

ipcMain.handle('window:is-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false);
ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window:leave-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.setFullScreen(false));
ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

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

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-update-status', () => updateStatus);
ipcMain.handle('app:check-for-updates', async () => {
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
ipcMain.handle('app:install-update', async (_, token?: string) => {
  updateInstallRequested = true;
  updateSessionToken = token;
  if (updateStatus === 'downloaded') {
    if (updateSessionToken) await db.revokeSession(updateSessionToken).catch(() => {});
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
  win.on('closed', () => setupModeWindows.delete(webContentsId));
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

ipcMain.handle('app:exit-confirmed', async (_, token?: string) => {
  if (token) await db.revokeSession(token).catch(() => {});
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
