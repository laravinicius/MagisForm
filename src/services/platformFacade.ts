import type { DesktopConfigDto, DesktopConnectionResultDto } from './desktopTypes';

export type UpdateStatus = 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';
export type ExitContext = { source: 'window-close' | 'logout' };
const desktop = () => import.meta.env.VITE_APP_TRANSPORT === 'desktop';
const adapter = async () => (await import('./ipcAdapter')).ipcPlatformAdapter;
const unsupportedConfig: DesktopConfigDto = { host: '', port: 3306, user: '', password: '', database: 'magisform' };
const unsupportedResult: DesktopConnectionResultDto = { success: false, error: 'Configuração de banco disponível somente no aplicativo desktop.' };

/** Capacidades da plataforma. Ausência de suporte sempre é explícita. */
export const platform = {
  capabilities: () => ({ window: desktop(), updater: desktop(), connectionConfiguration: desktop(), nativeDialogs: desktop(), externalLinks: true, exitConfirmation: desktop() }),
  window: {
    isFullscreen: async () => desktop() ? (await adapter()).window.isFullscreen() : false,
    minimize: async () => desktop() ? (await adapter()).window.minimize() : undefined,
    leaveFullscreen: async () => desktop() ? (await adapter()).window.leaveFullscreen() : undefined,
    close: async () => desktop() ? (await adapter()).window.close() : undefined,
    onFullscreenChanged: (cb: (value: boolean) => void) => { if (!desktop()) return () => {}; let cleanup: (() => void) | undefined; void adapter().then(a => { cleanup = a.window.onFullscreenChanged(cb); }); return () => cleanup?.(); },
  },
  app: {
    version: async () => desktop() ? (await adapter()).app.version() : 'Web',
    updateStatus: async (): Promise<UpdateStatus> => desktop() ? (await adapter()).app.updateStatus() : 'not-available',
    checkForUpdates: async () => desktop() ? (await adapter()).app.checkForUpdates() : { success: false, supported: false },
    installUpdate: async (token?: string) => desktop() ? (await adapter()).app.installUpdate(token) : { success: false },
    onUpdateStatus: (cb: (status: UpdateStatus) => void) => { if (!desktop()) return () => {}; let cleanup: (() => void) | undefined; void adapter().then(a => { cleanup = a.app.onUpdateStatus(cb); }); return () => cleanup?.(); },
    onConfirmExit: (cb: (context: ExitContext) => void) => { if (!desktop()) return () => {}; let cleanup: (() => void) | undefined; void adapter().then(a => { cleanup = a.app.onConfirmExit(cb); }); return () => cleanup?.(); },
    confirmExit: async (token?: string) => desktop() ? (await adapter()).app.confirmExit(token) : undefined,
  },
  setup: {
    getConfig: async () => desktop() ? (await adapter()).setup.getConfig() : unsupportedConfig,
    saveConfig: async (config: DesktopConfigDto) => desktop() ? (await adapter()).setup.saveConfig(config) : unsupportedResult,
    testConnection: async (config?: DesktopConfigDto) => desktop() ? (await adapter()).setup.testConnection(config) : unsupportedResult,
  },
  brand: {
    publicConfig: async () => desktop()
      ? (await import('./ipcAdapter')).ipcPlatformAdapter.brand.publicConfig()
      : (async () => {
        const response = await fetch('/api/v1/public-config', { credentials: 'same-origin' });
        return response.ok ? (await response.json()).data : null;
      })(),
  },
  dialogs: {
    showMessage: async (options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string }) => { if (!desktop()) throw new Error('Diálogo nativo indisponível no navegador.'); return (await adapter()).dialogs.showMessage(options); },
    openWhatsApp: async (url: string) => {
      if (desktop()) return (await adapter()).dialogs.openWhatsApp(url);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) throw new Error('O navegador bloqueou a abertura do link.');
    },
  },
};
