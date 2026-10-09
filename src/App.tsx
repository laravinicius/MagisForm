import { DialogSurface } from './components/DialogSurface';
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Cross, ClipboardList, BarChart3, User as UserIcon, PlusCircle, LogOut,
  CheckCircle2, Clock, Menu, Settings, RefreshCw, AlertCircle,
  CheckCircle, History, AlertTriangle, Bookmark, ChevronDown, FlaskConical, Cog, X, Download,
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { DataTransportUnavailableError, db } from './services/lanDatabase';
import { platform } from './services/platformFacade';
import { TitleBar } from './components/TitleBar';
import { User, Formula, USER_ROLE_LABELS } from './types';
import { BrandLogo } from './components/Logo';
import { BRAND, COLORS } from '../config/branding';
import { NavItem } from './components/NavItem';
import { AdminPanel } from './components/UserManager';
import { CustomerManager } from './components/CustomerManager';
import { InsumoManager } from './components/InsumoManager';
import { SettingsManager } from './components/SettingsManager';
import { Dashboard } from './components/Dashboard';
import { RecipeForm } from './components/RecipeForm';
import { FormulaList } from './components/FormulaList';
import { SavedFormulaManager } from './components/SavedFormulaManager';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FormDraftProvider, useFormDraft } from './context/FormDraftContext';
import { AdminAuthModal } from './components/AdminAuthModal';
import { handleDialogArrowNavigation, handleEnterAsTab } from './utils/enterNavigation';

interface HeartbeatMetrics {
  callCount: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  lastDurationMs: number;
  lastValid: boolean | null;
  lastError: string | null;
}

const heartbeatMetrics: HeartbeatMetrics = {
  callCount: 0,
  successCount: 0,
  failureCount: 0,
  totalDurationMs: 0,
  lastDurationMs: 0,
  lastValid: null,
  lastError: null,
};

function UpdateIndicator({ sessionToken, placement = 'floating', collapsed = false }: {
  sessionToken: string | null;
  placement?: 'floating' | 'sidebar';
  collapsed?: boolean;
}) {
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'>('checking');
  const [installRequested, setInstallRequested] = useState(false);
  const [showUpdateReady, setShowUpdateReady] = useState(false);
  const [updateNotice, setUpdateNotice] = useState('');
  const [manualCheckInProgress, setManualCheckInProgress] = useState(false);
  const installRequestedRef = useRef(false);
  const manualCheckRequestedRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [noticePosition, setNoticePosition] = useState({ left: 16, bottom: 56 });

  useEffect(() => {
    let active = true;
    Promise.all([platform.app.version(), platform.app.updateStatus()]).then(([currentVersion, currentStatus]) => {
      if (!active) return;
      setVersion(currentVersion);
      setStatus(currentStatus);
    }).catch(() => {});
    const cleanup = platform.app.onUpdateStatus(nextStatus => {
      setStatus(nextStatus);
      if (nextStatus !== 'checking' && nextStatus !== 'downloading') setManualCheckInProgress(false);
      if (nextStatus === 'downloaded' && installRequestedRef.current) setShowUpdateReady(true);
      if (nextStatus === 'available' || nextStatus === 'downloaded') {
        manualCheckRequestedRef.current = false;
        setUpdateNotice('');
      }
      if (nextStatus === 'error' || nextStatus === 'not-available') {
        installRequestedRef.current = false;
        setInstallRequested(false);
        if (manualCheckRequestedRef.current) {
          manualCheckRequestedRef.current = false;
          setUpdateNotice(nextStatus === 'not-available' ? 'O aplicativo já está atualizado.' : 'Não foi possível verificar atualizações.');
          if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = setTimeout(() => setUpdateNotice(''), 4000);
        }
      }
    });
    return () => { active = false; cleanup(); if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); };
  }, []);

  const canInstall = status === 'available' || status === 'downloading' || status === 'downloaded';
  const isChecking = status === 'checking' || manualCheckInProgress;
  const installLabel = installRequested
    ? (status === 'downloaded' ? 'Instalando atualização…' : 'Baixando atualização…')
    : 'Atualização disponível; clique para instalar';

  useLayoutEffect(() => {
    if (!updateNotice || !indicatorRef.current) return;
    const indicator = indicatorRef.current;
    const repositionNotice = () => {
      const rect = indicator.getBoundingClientRect();
      setNoticePosition({ left: Math.max(16, rect.left), bottom: window.innerHeight - rect.top + 8 });
    };
    repositionNotice();
    const observer = new ResizeObserver(repositionNotice);
    observer.observe(indicator);
    window.addEventListener('resize', repositionNotice);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', repositionNotice);
    };
  }, [updateNotice, collapsed, canInstall, installRequested]);

  const handleInstall = async () => {
    if (status === 'downloaded') {
      setShowUpdateReady(true);
      return;
    }
    installRequestedRef.current = true;
    setInstallRequested(true);
    const result = await platform.app.installUpdate(sessionToken ?? undefined).catch(() => ({ success: false }));
    if (!result.success) { installRequestedRef.current = false; setInstallRequested(false); }
  };

  const confirmInstall = async () => {
    setShowUpdateReady(false);
    installRequestedRef.current = true;
    setInstallRequested(true);
    const result = await platform.app.installUpdate(sessionToken ?? undefined).catch(() => ({ success: false }));
    if (!result.success) { installRequestedRef.current = false; setInstallRequested(false); }
  };

  const handleCheckForUpdates = async () => {
    if (status === 'checking' || status === 'downloading' || manualCheckInProgress) return;
    setManualCheckInProgress(true);
    manualCheckRequestedRef.current = true;
    setUpdateNotice('');
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    const result = await platform.app.checkForUpdates().catch(() => ({ success: false, supported: false }));
    if (!result.success) {
      setManualCheckInProgress(false);
      manualCheckRequestedRef.current = false;
      setUpdateNotice(result.supported
        ? 'Não foi possível verificar atualizações.'
        : 'A verificação está disponível na versão instalada do aplicativo.');
      noticeTimerRef.current = setTimeout(() => setUpdateNotice(''), 4000);
    }
  };

  return (
    <>
    <div ref={indicatorRef}
      className={`${placement === 'floating' ? 'fixed bottom-3 left-4 z-40 max-w-[calc(100vw-2rem)] text-muted gap-2 py-1' : 'w-full text-nav-muted gap-1'} flex ${collapsed ? 'flex-col' : 'flex-wrap'} items-center ${collapsed ? 'px-0' : 'px-3'} text-xs`}>
      {canInstall && (
        <button type="button" onClick={handleInstall} disabled={installRequested}
          className={`ui-button flex ${collapsed ? 'relative h-8 w-8 justify-center' : 'w-full gap-1.5 text-left'} items-center rounded font-semibold ${placement === 'sidebar' ? 'text-surface hover:text-sage focus-visible:outline-surface' : 'text-brand hover:text-brand-hover focus-visible:outline-brand'} focus-visible:outline focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60`}
          title={installRequested ? 'A atualização será instalada quando o download terminar' : installLabel}
          aria-label={installLabel}>
          {collapsed && <Download className="h-4 w-4" aria-hidden="true" />}
          <span aria-hidden="true" className={`${collapsed ? 'absolute right-0 top-0' : 'shrink-0'} h-2 w-2 rounded-full bg-coral animate-pulse`} />
          {!collapsed && (installRequested ? (status === 'downloaded' ? 'Instalando atualização…' : 'Baixando atualização…') : 'Atualização disponível')}
        </button>
      )}
      {!collapsed && <span className="min-w-0 break-words">Versão {version || '—'}</span>}
      <button type="button" onClick={handleCheckForUpdates} disabled={status === 'checking' || status === 'downloading' || manualCheckInProgress}
        className={`ui-button ui-icon-button flex shrink-0 items-center justify-center rounded ${placement === 'sidebar' ? 'h-8 w-8 text-nav-muted hover:text-surface focus-visible:outline-surface' : 'h-8 w-8 text-brand hover:text-brand-hover focus-visible:outline-brand'} focus-visible:outline focus-visible:outline-2 disabled:cursor-wait disabled:opacity-50`}
        title={collapsed ? `Verificar atualizações — Versão ${version || '—'}` : 'Verificar atualizações'}
        aria-label={isChecking ? 'Verificando atualizações' : 'Verificar atualizações'} aria-busy={isChecking}>
        <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
      </button>
      </div>
      {updateNotice && createPortal(
        <span role="status" style={noticePosition} className="ui-popover fixed z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink ">{updateNotice}</span>,
        document.body
      )}
      {showUpdateReady && (
        createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-scrim p-4" onKeyDown={handleDialogArrowNavigation}>
          <DialogSurface className="ui-dialog w-full max-w-md rounded-2xl bg-surface p-6 text-center ">
            <h2 id="update-ready-title" className="ui-page-title mb-5 text-lg font-medium text-ink">Atualização baixada, clique OK para atualizar</h2>
            <button type="button" onClick={confirmInstall} autoFocus
              className="ui-button ui-button-primary rounded-xl px-8 py-2.5 text-sm font-semibold text-on-coral hover:opacity-90"
              >
              OK
            </button>
          </DialogSurface>
        </div>, document.body)
      )}
    </>
  );
}

export function getHeartbeatMetrics(): HeartbeatMetrics {
  return { ...heartbeatMetrics };
}

export function resetHeartbeatMetrics(): void {
  heartbeatMetrics.callCount = 0;
  heartbeatMetrics.successCount = 0;
  heartbeatMetrics.failureCount = 0;
  heartbeatMetrics.totalDurationMs = 0;
  heartbeatMetrics.lastDurationMs = 0;
  heartbeatMetrics.lastValid = null;
  heartbeatMetrics.lastError = null;
}

// ─── Modal de Confirmação de Saída ─────────────────────────────────────────────

function ExitConfirmModal({ show, context, onConfirm, onCancel }: {
  show: boolean;
  context: 'window-close' | 'logout' | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!show || !context) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onCancel}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
      <DialogSurface className="ui-dialog bg-surface rounded-2xl  w-full max-w-md p-6" onClick={e => e.stopPropagation()} onKeyDown={handleDialogArrowNavigation} role="dialog" aria-modal="true">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-warning-strong flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-bold text-ink text-lg">
              {context === 'window-close' ? 'Sair do aplicativo' : 'Sair da conta'}
            </h3>
            <p className="text-xs text-muted">
              {context === 'window-close' ? 'O aplicativo será fechado completamente.' : 'Sua sessão será encerrada.'}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink mb-4">
          {context === 'window-close' ? 'Deseja realmente sair do aplicativo?' : 'Deseja realmente sair da conta?'}
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} autoFocus
            className="ui-button flex-1 py-2.5 rounded-xl border border-control-line font-semibold text-sm text-ink hover:bg-canvas transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm}
            className="ui-button ui-button-primary flex-1 py-2.5 rounded-xl text-on-coral font-semibold text-sm hover:opacity-90 transition-all"
            >
            Sim, sair
          </button>
        </div>
      </DialogSurface>
    </div>
  );
}

// ─── App Principal ─────────────────────────────────────────────────────────────

function AppInner() {
  const { user, sessionToken, setAuth, clearAuth } = useAuth();
  const { clearDrafts, hasDrafts } = useFormDraft();
  const isWeb = import.meta.env.VITE_APP_TRANSPORT === 'web';
  const [authReady, setAuthReady] = useState(!isWeb);
  const [setupMode, setSetupMode] = useState(false);
  const [loginConflict, setLoginConflict] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'recipe' | 'pending' | 'confirmed' | 'formulaDetail' | 'confirmedDetail' | 'history' | 'historyDetail' | 'cancelled' | 'cancelledDetail' | 'customers' | 'insumos' | 'savedFormulas' | 'settings'>('dashboard');
  const [confirmedStage, setConfirmedStage] = useState<'em_producao' | 'aguardando_retirada'>('em_producao');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [formulasMenuOpen, setFormulasMenuOpen] = useState(true);
  const [managementMenuOpen, setManagementMenuOpen] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [templateFormula, setTemplateFormula] = useState<Formula | null>(null);
  const [viewingFormula, setViewingFormula] = useState<Formula | null>(null);
  const [partialPaymentAmounts, setPartialPaymentAmounts] = useState<Record<number, string>>({});
  const [missingReasons, setMissingReasons] = useState<string[] | null>(null);
  const [missingReasonsTarget, setMissingReasonsTarget] = useState<'pending' | 'confirmed' | null>(null);
  const [autoUnlockFormula, setAutoUnlockFormula] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitContext, setExitContext] = useState<'window-close' | 'logout' | null>(null);
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem('magisform.fontScale')) || 1);
  const canViewSavedFormulas = user?.role === 'pharmacist' || user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    if (!canViewSavedFormulas && activeTab === 'savedFormulas') {
      setActiveTab('dashboard');
    }
  }, [activeTab, canViewSavedFormulas]);

  const isTabActive = useCallback((tab: string) => {
    if (activeTab === tab) return true;
    if (tab === 'pending' && activeTab === 'formulaDetail') return true;
    if (tab === 'confirmed' && activeTab === 'confirmedDetail') return true;
    if (tab === 'history' && activeTab === 'historyDetail') return true;
    if (tab === 'cancelled' && activeTab === 'cancelledDetail') return true;
    return false;
  }, [activeTab]);

  useEffect(() => {
    if (['recipe', 'pending', 'confirmed', 'formulaDetail', 'confirmedDetail', 'history', 'historyDetail', 'cancelled', 'cancelledDetail', 'insumos'].includes(activeTab)) {
      setFormulasMenuOpen(true);
    }
    if (['customers', 'savedFormulas'].includes(activeTab)) {
      setManagementMenuOpen(true);
    }
  }, [activeTab]);

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInactivityLogoutRef = useRef<() => Promise<void>>();
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

  const handleInactivityLogout = useCallback(async () => {
    await db.auth.logout(sessionToken ?? undefined).catch(() => {});
    clearDrafts();
    clearAuth();
    setPartialPaymentAmounts({});
    setSetupMode(false);
    setActiveTab('dashboard');
    setLoginForm({ username: '', password: '' });
    setLoginError('Sessão encerrada por inatividade (5 min).');
  }, [sessionToken, clearAuth, clearDrafts]);

  useEffect(() => {
    handleInactivityLogoutRef.current = handleInactivityLogout;
  }, [handleInactivityLogout]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => handleInactivityLogoutRef.current?.(), INACTIVITY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
    localStorage.setItem('magisform.fontScale', String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    if (!viewingFormula) setAutoUnlockFormula(false);
  }, [viewingFormula]);

  useEffect(() => {
    const formulaId = Number(new URLSearchParams(window.location.search).get('formulaId'));
    if (!user || !Number.isSafeInteger(formulaId) || formulaId <= 0) return;
    let active = true;
    void db.formulas.get(formulaId).then(formula => {
      if (!active || !formula) return;
      setViewingFormula(formula);
      setActiveTab(formula.status === 'confirmed' ? 'confirmedDetail' : formula.status === 'delivered' ? 'historyDetail' : formula.status === 'cancelled' ? 'cancelledDetail' : 'formulaDetail');
    }).catch(error => {
      if (active) setToast({ msg: error instanceof Error ? error.message : 'Não foi possível abrir a fórmula solicitada.', type: 'info' });
    });
    return () => { active = false; };
  }, [user, window.location.search]);

  useEffect(() => {
    if (!user || setupMode || (!isWeb && !sessionToken)) return;

    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'] as const;

    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

    resetInactivityTimer();

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, handleActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [user, setupMode, sessionToken, resetInactivityTimer, isWeb]);

  useEffect(() => {
    if (!isWeb) return;
    let active = true;
    void db.auth.current().then(res => {
      if (!active) return;
      if (res.success && res.user) setAuth(res.user, null);
      setAuthReady(true);
    }).catch(() => {
      if (!active) return;
      setLoginError('Não foi possível verificar a sessão. Confira a conexão e tente entrar novamente.');
      setAuthReady(true);
    });
    return () => { active = false; };
  }, [isWeb, setAuth]);

  useEffect(() => db.auth.onExpired(() => {
    db.auth.invalidateSession();
    clearDrafts(); clearAuth(); setPartialPaymentAmounts({}); setSetupMode(false);
    setLoginError('Sua sessão expirou ou foi encerrada em outro dispositivo. Entre novamente.');
  }), [clearAuth, clearDrafts]);

  const showToast = (msg: string, type: 'success' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const doLogin = async (force: boolean) => {
    setLoginLoading(true); setLoginError('');
    try {
      const res = await db.auth.login(loginForm.username, loginForm.password, force);
      if (res.success) {
        clearDrafts();
        setAuth(res.user, res.sessionToken ?? null);
        setSetupMode(res.setupMode === true);
        setActiveTab('dashboard');
        setLoginConflict(false);
      } else if (res.conflict) {
        setLoginConflict(true);
      } else {
        setLoginError(res.error ?? 'Erro ao fazer login.');
      }
    } catch (error) {
      setLoginError(error instanceof DataTransportUnavailableError ? error.message : 'Erro ao conectar ao servidor.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(false);
  };

  const handleLogout = () => {
    setExitContext('logout');
    setShowExitConfirm(true);
  };

  const handleExitConfirm = async () => {
    if (exitContext === 'window-close') {
      await platform.app.confirmExit(sessionToken ?? undefined);
    } else if (exitContext === 'logout') {
      await db.auth.logout(sessionToken ?? undefined).catch(() => {});
      clearDrafts();
      clearAuth();
      setPartialPaymentAmounts({});
      setSetupMode(false);
      setActiveTab('dashboard');
      setLoginForm({ username: '', password: '' });
    }
    setShowExitConfirm(false);
    setExitContext(null);
  };

  const handleExitCancel = () => {
    setShowExitConfirm(false);
    setExitContext(null);
  };

  const exitModal = (
    <ExitConfirmModal
      show={showExitConfirm}
      context={exitContext}
      onConfirm={handleExitConfirm}
      onCancel={handleExitCancel}
    />
  );

  // Mantém a sessão viva; se ela for derrubada por outro login, volta ao login
  const isHeartbeatRunningRef = useRef(false);

  useEffect(() => {
    if (!user || setupMode || (!isWeb && !sessionToken)) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const runHeartbeat = async () => {
      if (isHeartbeatRunningRef.current) return;
      isHeartbeatRunningRef.current = true;
      const start = performance.now();
      try {
        heartbeatMetrics.callCount++;
        const res = await db.auth.heartbeat(sessionToken ?? undefined);
        const duration = performance.now() - start;
        heartbeatMetrics.totalDurationMs += duration;
        heartbeatMetrics.lastDurationMs = duration;
        heartbeatMetrics.lastValid = res.valid;
        heartbeatMetrics.lastError = null;
        if (res.valid) {
          heartbeatMetrics.successCount++;
        } else {
          heartbeatMetrics.failureCount++;
        }
        if (!res.valid) {
          clearDrafts();
          clearAuth();
          setPartialPaymentAmounts({});
          setSetupMode(false);
          setLoginError('Sua sessão foi encerrada em outro dispositivo.');
        }
      } catch (e: any) {
        const duration = performance.now() - start;
        heartbeatMetrics.totalDurationMs += duration;
        heartbeatMetrics.lastDurationMs = duration;
        heartbeatMetrics.failureCount++;
        heartbeatMetrics.lastError = e.message ?? 'Erro desconhecido';
        /* servidor fora do ar: mantém a sessão local */
      } finally {
        isHeartbeatRunningRef.current = false;
      }
    };

    runHeartbeat();
    timer = setInterval(runHeartbeat, 30_000);
    return () => {
      if (timer) clearInterval(timer);
      isHeartbeatRunningRef.current = false;
    };
  }, [user, setupMode, sessionToken, isWeb]);

  useEffect(() => {
    if (!isWeb || !user || !hasDrafts) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isWeb, user, hasDrafts]);

  useEffect(() => {
    if (!isWeb) return;
    const adaptNavigationWidth = () => setIsSidebarOpen(window.innerWidth >= 900);
    window.addEventListener('resize', adaptNavigationWidth);
    adaptNavigationWidth();
    return () => window.removeEventListener('resize', adaptNavigationWidth);
  }, [isWeb]);

  useEffect(() => {
    const cleanup = platform.app.onConfirmExit((context) => {
      setExitContext(context.source);
      setShowExitConfirm(true);
    });
    return cleanup;
  }, []);

  if (isWeb && !authReady) return <div className="flex-1 grid place-items-center bg-canvas text-muted">Verificando sessão…</div>;

  if (!user) {
    return (
      <>
        {!isWeb && <UpdateIndicator sessionToken={sessionToken} />}
        <div className="ui-login flex-1 min-h-0 flex flex-col items-center p-4 bg-canvas">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="ui-login-card ui-panel w-full max-w-md bg-surface rounded-2xl  border border-line overflow-hidden"
          >
            <div className="h-1.5 w-full" style={{ background: COLORS.secondary }} />
            <div className="flex justify-center px-8 pt-5">
              <div style={{ maxWidth: 408 }}>
                <BrandLogo size="lg" />
              </div>
            </div>
            <div className="px-8 py-6">
            <div className="flex flex-col items-center mb-8">
              <p className="text-muted text-sm mt-2">Acesse sua conta para continuar</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-app-1" >Usuário</label>
                <input type="text" required autoFocus
                  className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none transition-all"
                  value={loginForm.username}
                  autoComplete="username"
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                 id="mf-app-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-app-2" >Senha</label>
                <input type="password" required
                  className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none transition-all"
                  value={loginForm.password}
                  autoComplete="current-password"
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !loginLoading) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                 id="mf-app-2" />
              </div>
              {loginError && (
                <div className="flex items-center gap-2 text-danger text-sm bg-danger-soft px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />{loginError}
                </div>
              )}
              <button type="submit" disabled={loginLoading}
                className="ui-button ui-button-primary ui-popover w-full hover:opacity-90 disabled:opacity-60 text-on-coral font-semibold py-2.5 rounded-lg transition-all  "

              >
                {loginLoading ? 'Conectando...' : 'Entrar'}
              </button>
              {!isWeb && <button type="button"
                onClick={() => { setExitContext('window-close'); setShowExitConfirm(true); }}
                className="ui-button w-full py-2.5 rounded-lg border border-control-line font-semibold text-sm text-ink hover:bg-canvas transition-colors"
              >
                Sair
              </button>}
            </form>
            </div>
          </motion.div>

          {loginConflict && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={() => setLoginConflict(false)}
              onKeyDown={e => { if (e.key === 'Escape') setLoginConflict(false); }}>
              <DialogSurface className="ui-dialog bg-surface rounded-2xl  w-full max-w-md p-6" onClick={e => e.stopPropagation()} onKeyDown={handleDialogArrowNavigation} role="dialog" aria-modal="true">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-warning-strong flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink text-lg">Usuário já logado</h3>
                    <p className="text-xs text-muted">Este usuário já está logado em outro dispositivo.</p>
                  </div>
                </div>
                <p className="text-sm text-ink mb-4">Deseja entrar mesmo assim? A sessão do outro dispositivo será encerrada.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setLoginConflict(false)} autoFocus
                    className="ui-button flex-1 py-2.5 rounded-xl border border-control-line font-semibold text-sm text-ink hover:bg-canvas transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => doLogin(true)} disabled={loginLoading}
                    className="ui-button ui-button-primary flex-1 py-2.5 rounded-xl text-on-coral font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60"
                    >
                    {loginLoading ? 'Entrando...' : 'Entrar mesmo assim'}
                  </button>
                </div>
              </DialogSurface>
            </div>
          )}
        </div>
        {exitModal}
      </>
    );
  }

  if (setupMode) {
    return (
      <>
        <div className="flex-1 min-h-0 flex flex-col bg-canvas">
          <header className="ui-header bg-surface border-b border-line flex items-center justify-between px-8 shrink-0">
            <BrandLogo size="md" />
            <button
              onClick={handleLogout}
              className="ui-button inline-flex items-center gap-2 rounded-lg border border-control-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </header>
          <main className="ui-content flex-1 overflow-auto">
            <SettingsManager />
          </main>
        </div>
        {exitModal}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 min-h-0">

      {/* Toast de notificação */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="ui-popover fixed top-10 right-4 z-50 px-4 py-3 rounded-xl  text-sm font-semibold text-white flex items-center gap-2 pointer-events-none"
            style={{ background: toast.type === 'success' ? COLORS.success : COLORS.secondary }}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
        {/* Sidebar */}
        <aside data-collapsed={!isSidebarOpen} className={`ui-sidebar border-r border-line ${isSidebarOpen ? 'w-[256px]' : 'w-[80px]'} flex flex-col shrink-0 h-full overflow-hidden`}
          style={{ background: COLORS.secondary }}>
          <div className="p-5 w-full">
            <BrandLogo size={isSidebarOpen ? 'sidebar' : 'icon'} />
          </div>

          {setupMode && isSidebarOpen && (
            <div className="mx-4 mb-4 px-3 py-2 rounded-lg" style={{ background: COLORS.navActiveBg, border: `1px solid ${COLORS.navMuted}` }}>
              <p className="text-xs font-semibold text-danger">Modo Configuração</p>
              <p className="text-xs text-danger mt-0.5">Configure o servidor e faça login normalmente.</p>
            </div>
          )}

          <nav className="flex-1 min-h-0 overflow-y-auto px-4 space-y-1">
            {!setupMode && (
              <>
                <NavItem icon={<BarChart3 />} label="Dashboard" active={isTabActive('dashboard')} onClick={() => setActiveTab('dashboard')} collapsed={!isSidebarOpen} />
                <button type="button" onClick={() => {
                  if (!isSidebarOpen) {
                    setIsSidebarOpen(true);
                    setFormulasMenuOpen(true);
                  } else {
                    setFormulasMenuOpen(open => !open);
                  }
                }} title={!isSidebarOpen ? 'Fórmulas' : undefined} aria-label={!isSidebarOpen ? 'Fórmulas' : undefined} aria-expanded={isSidebarOpen && formulasMenuOpen}
                  className={`ui-button ui-nav w-full flex items-center justify-between rounded-lg text-nav-muted ${isSidebarOpen ? 'hover:text-surface hover:bg-nav-active' : 'justify-center hover:text-surface hover:bg-nav-active'}`}>
                  <span className="flex items-center gap-3 truncate"><FlaskConical className="w-5 h-5 shrink-0" />{isSidebarOpen && 'Fórmulas'}</span>
                  {isSidebarOpen && <ChevronDown className={`w-4 h-4 transition-transform ${formulasMenuOpen ? 'rotate-180' : ''}`} />}
                </button>
                {formulasMenuOpen && <div className={`${isSidebarOpen ? 'pl-3 ' : ''}space-y-1`}>
                  <NavItem icon={<PlusCircle />} label="Nova Fórmula" active={isTabActive('recipe')} onClick={() => setActiveTab('recipe')} collapsed={!isSidebarOpen} />
                  <NavItem icon={<Clock />} label="Pendentes" active={isTabActive('pending')} onClick={() => setActiveTab('pending')} collapsed={!isSidebarOpen} />
                  <NavItem icon={<CheckCircle2 />} label="Confirmadas" active={isTabActive('confirmed')} onClick={() => { setConfirmedStage('em_producao'); setActiveTab('confirmed'); }} collapsed={!isSidebarOpen} />
                  <NavItem icon={<History />} label="Histórico" active={isTabActive('history')} onClick={() => setActiveTab('history')} collapsed={!isSidebarOpen} />
                  <NavItem icon={<X />} label="Canceladas" active={isTabActive('cancelled')} onClick={() => setActiveTab('cancelled')} collapsed={!isSidebarOpen} />
                  <NavItem icon={<Cross />} label="Insumos" active={isTabActive('insumos')} onClick={() => setActiveTab('insumos')} collapsed={!isSidebarOpen} />
                </div>}
                <button type="button" onClick={() => {
                  if (!isSidebarOpen) {
                    setIsSidebarOpen(true);
                    setManagementMenuOpen(true);
                  } else {
                    setManagementMenuOpen(open => !open);
                  }
                }} title={!isSidebarOpen ? 'Gerenciamento' : undefined} aria-label={!isSidebarOpen ? 'Gerenciamento' : undefined} aria-expanded={isSidebarOpen && managementMenuOpen}
                  className={`ui-button ui-nav w-full flex items-center justify-between rounded-lg text-nav-muted ${isSidebarOpen ? 'hover:text-surface hover:bg-nav-active' : 'justify-center hover:text-surface hover:bg-nav-active'}`}>
                  <span className="flex items-center gap-3 truncate"><Cog className="w-5 h-5 shrink-0" />{isSidebarOpen && 'Gerenciamento'}</span>
                  {isSidebarOpen && <ChevronDown className={`w-4 h-4 transition-transform ${managementMenuOpen ? 'rotate-180' : ''}`} />}
                </button>
                {managementMenuOpen && <div className={`${isSidebarOpen ? 'pl-3 ' : ''}space-y-1`}>
                  <NavItem icon={<Users />} label="Clientes" active={isTabActive('customers')} onClick={() => setActiveTab('customers')} collapsed={!isSidebarOpen} />
                  {canViewSavedFormulas && <NavItem icon={<Bookmark />} label="Minhas Fórmulas" active={isTabActive('savedFormulas')} onClick={() => setActiveTab('savedFormulas')} collapsed={!isSidebarOpen} />}
                </div>}
              </>
            )}
          </nav>

          <div className="shrink-0 px-4 pb-3">
            {user.role !== 'employee' && (
              <NavItem icon={<Settings />} label="Administração" active={isTabActive('admin')} onClick={() => setActiveTab('admin')} collapsed={!isSidebarOpen} />
            )}
            {!isWeb && <UpdateIndicator sessionToken={sessionToken} placement="sidebar" collapsed={!isSidebarOpen} />}
          </div>

          <div className="shrink-0 p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className={`ui-user flex items-center gap-3 p-2 rounded-lg ${isSidebarOpen ? '' : ''}`}
              style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center shrink-0 cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => !isSidebarOpen && setIsSidebarOpen(true)}
                title={!isSidebarOpen ? 'Clique para abrir o menu' : ''}>
                <UserIcon className="w-4 h-4 text-nav-muted" />
              </div>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.name}</p>
                  <p className="text-xs text-nav-muted">{USER_ROLE_LABELS[user.role]}</p>
                </div>
              )}
              {isSidebarOpen && (
                <button onClick={handleLogout} aria-label="Sair da conta"
                  className="ui-button ui-icon-button transition-colors text-nav-muted hover:text-surface">
                  <LogOut className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="ui-header bg-surface border-b border-line flex items-center justify-between px-8 shrink-0">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label={isSidebarOpen ? 'Recolher menu' : 'Expandir menu'} aria-expanded={isSidebarOpen} className="ui-button ui-icon-button text-muted hover:text-ink">
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-4 flex-wrap justify-end">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFontScale(Math.max(0.75, fontScale - 0.125))}
                  disabled={fontScale <= 0.75}
                  title="Diminuir fonte"
                  aria-label="Diminuir fonte"
                  className="ui-button ui-button-secondary w-11 h-11 rounded-lg font-bold text-surface disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"

                >
                  a&minus;
                </button>
                <button
                  onClick={() => setFontScale(Math.min(1.5, fontScale + 0.125))}
                  disabled={fontScale >= 1.5}
                  title="Aumentar fonte"
                  aria-label="Aumentar fonte"
                  className="ui-button ui-button-primary w-11 h-11 rounded-lg font-bold text-on-coral disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"

                >
                  A+
                </button>
              </div>
              <div className="ui-header-date text-sm text-muted text-right">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </header>

          <div className="ui-content flex-1 overflow-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && <Dashboard user={user} onNavigate={setActiveTab} />}
              {activeTab === 'admin' && <AdminPanel user={user} />}
              {activeTab === 'recipe' && <RecipeForm user={user} template={templateFormula} onClearTemplate={() => setTemplateFormula(null)} onComplete={(dest) => { setTemplateFormula(null); setActiveTab(dest); }} />}
              {activeTab === 'formulaDetail' && viewingFormula && <RecipeForm user={user} formula={viewingFormula} initialLocked={!autoUnlockFormula} partialPaymentAmount={partialPaymentAmounts[viewingFormula.id] ?? ''} onPartialPaymentAmountChange={value => setPartialPaymentAmounts(current => value ? { ...current, [viewingFormula.id]: value } : Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== viewingFormula.id)))} onComplete={(dest) => { setViewingFormula(null); setTemplateFormula(null); setAutoUnlockFormula(false); setActiveTab(dest); }} />}
              {activeTab === 'confirmedDetail' && viewingFormula && <RecipeForm user={user} formula={viewingFormula} confirmed partialPaymentAmount={partialPaymentAmounts[viewingFormula.id] ?? ''} onPartialPaymentAmountChange={value => setPartialPaymentAmounts(current => value ? { ...current, [viewingFormula.id]: value } : Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== viewingFormula.id)))} onComplete={(dest) => { setViewingFormula(null); setTemplateFormula(null); setActiveTab('confirmed'); }} />}
              {activeTab === 'pending' && <FormulaList screenKey="pending" variant="pending" employeeName={user.name} title="Fórmulas Pendentes" subtitle="Fórmulas pendentes aguardando confirmação" statuses={['pending']} onSelect={(f) => { setViewingFormula(f); setActiveTab('formulaDetail'); }} onConfirm={(f, reasons) => { if (reasons.length === 0) { setConfirmedStage('em_producao'); setActiveTab('confirmed'); } else { setViewingFormula(f); setMissingReasons(reasons); setMissingReasonsTarget('pending'); setActiveTab('formulaDetail'); } }} />}
              {activeTab === 'confirmed' && <>
                <div className="mb-5 flex gap-2 border-b border-line">
                  <button onClick={() => setConfirmedStage('em_producao')} className={`ui-button px-4 py-2.5 text-sm font-bold border-b-2 ${confirmedStage === 'em_producao' ? 'border-brand text-brand bg-sage' : 'border-transparent text-muted'}`}>Em produção</button>
                  <button onClick={() => setConfirmedStage('aguardando_retirada')} className={`ui-button px-4 py-2.5 text-sm font-bold border-b-2 ${confirmedStage === 'aguardando_retirada' ? 'border-brand text-brand bg-sage' : 'border-transparent text-muted'}`}>Aguardando retirada</button>
                </div>
                <FormulaList screenKey={`confirmed-${confirmedStage}`} variant="confirmed" statuses={['confirmed']} employeeName={user.name} title={confirmedStage === 'em_producao' ? 'Fórmulas em produção' : 'Fórmulas aguardando retirada'} subtitle="Fórmulas confirmadas para manipulação" deliveryStatusFilter={confirmedStage} onSelect={(f) => { setViewingFormula(f); setActiveTab('confirmedDetail'); }} onDeliveryBlocked={(f, reasons) => { setViewingFormula(f); setMissingReasons(reasons); setMissingReasonsTarget('confirmed'); }} />
              </>}
              {activeTab === 'history' && <FormulaList screenKey="history" variant="confirmed" employeeName={user.name} title="Histórico" subtitle="Fórmulas entregues" statuses={['delivered']} showAndamento={false} showVerification monthlySummary onSelect={(f) => { setViewingFormula(f); setActiveTab('historyDetail'); }} onRepeat={(f) => { setTemplateFormula(f); setActiveTab('recipe'); }} />}
              {activeTab === 'historyDetail' && viewingFormula && <RecipeForm user={user} formula={viewingFormula} readOnly partialPaymentAmount={partialPaymentAmounts[viewingFormula.id] ?? ''} onPartialPaymentAmountChange={value => setPartialPaymentAmounts(current => value ? { ...current, [viewingFormula.id]: value } : Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== viewingFormula.id)))} onComplete={() => { setViewingFormula(null); setTemplateFormula(null); setActiveTab('history'); }} />}
              {activeTab === 'cancelled' && <FormulaList screenKey="cancelled" variant="pending" employeeName={user.name} title="Fórmulas Canceladas" subtitle="Fórmulas canceladas com justificativa registrada" statuses={['cancelled']} onSelect={(f) => { setViewingFormula(f); setActiveTab('cancelledDetail'); }} />}
              {activeTab === 'cancelledDetail' && viewingFormula && <RecipeForm user={user} formula={viewingFormula} readOnly partialPaymentAmount={partialPaymentAmounts[viewingFormula.id] ?? ''} onPartialPaymentAmountChange={value => setPartialPaymentAmounts(current => value ? { ...current, [viewingFormula.id]: value } : Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== viewingFormula.id)))} onComplete={() => { setViewingFormula(null); setActiveTab('cancelled'); }} />}
              {activeTab === 'customers' && <CustomerManager />}
              {activeTab === 'insumos' && <InsumoManager />}
              {activeTab === 'savedFormulas' && canViewSavedFormulas && <SavedFormulaManager />}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {missingReasons && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={() => { setMissingReasons(null); setMissingReasonsTarget(null); }}
          onKeyDown={e => { if (e.key === 'Escape') { setMissingReasons(null); setMissingReasonsTarget(null); } }}>
          <DialogSurface className="ui-dialog bg-surface rounded-2xl  w-full max-w-md p-6" onClick={e => e.stopPropagation()} onKeyDown={handleDialogArrowNavigation} role="dialog" aria-modal="true">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-danger-strong flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-ink text-lg">Informações necessárias</h3>
                <p className="text-xs text-muted">Preencha os campos abaixo para confirmar esta fórmula.</p>
              </div>
            </div>
            <ul className="space-y-2">
              {missingReasons.map(r => (
                <li key={r} className="flex items-center gap-2 text-sm text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => { setMissingReasons(null); setMissingReasonsTarget(null); }} autoFocus
                className="ui-button flex-1 py-2.5 rounded-xl border border-control-line font-semibold text-sm text-ink hover:bg-canvas transition-colors">
                Entendi
              </button>
              <button type="button" onClick={() => { const target = missingReasonsTarget; setMissingReasons(null); setMissingReasonsTarget(null); setAutoUnlockFormula(target === 'pending'); if (target === 'confirmed') setActiveTab('confirmedDetail'); }}
                className="ui-button ui-button-secondary flex-1 py-2.5 rounded-xl text-surface font-semibold text-sm hover:opacity-90 transition-all"
                >
                Editar
              </button>
            </div>
          </DialogSurface>
        </div>
      )}
      {exitModal}
    </>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      <FormDraftProvider>
        <div className={`h-screen overflow-hidden bg-canvas flex flex-col ${import.meta.env.VITE_APP_TRANSPORT === 'desktop' ? 'pt-[30px]' : ''}`} onKeyDown={handleEnterAsTab}>
          <TitleBar />
          <AppInner />
        </div>
      </FormDraftProvider>
    </AuthProvider>
    </MotionConfig>
  );
}


