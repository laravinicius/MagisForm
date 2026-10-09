import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { COLORS } from '../../config/branding';
import { motion } from 'motion/react';
import { AdminUserManager } from './AdminUserManager';
import { AuditLogs } from './AuditLogs';
import { platform } from '../services/platformFacade';
import type { DesktopConfigDto } from '../services/desktopTypes';

export function SettingsManager() {
  const [config, setConfig] = useState<DesktopConfigDto>({ connectionMode: 'local', serverUrl: '', host: '', port: 3306, user: '', password: '', database: 'magisform' });
  const [savedConfig, setSavedConfig] = useState<DesktopConfigDto>(config);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'db' | 'admin' | 'logs'>('db');

  useEffect(() => {
    if (platform.capabilities().connectionConfiguration) {
      platform.setup.getConfig().then((cfg) => {
        const loaded = { ...config, ...cfg };
        setConfig(loaded);
        setSavedConfig(loaded);
      });
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const restartRequired = config.connectionMode !== savedConfig.connectionMode || (config.connectionMode === 'remote' && config.serverUrl !== savedConfig.serverUrl);
    if (restartRequired && !window.confirm('A troca de conexão encerrará sua sessão e reiniciará o MagisForm agora. Deseja continuar?')) return;
    setSaving(true);
    try {
      const result = await platform.setup.saveConfig(config);
      if (!result.success) { setStatus({ type: 'error', msg: result.error ?? 'Configuração indisponível nesta plataforma.' }); return; }
      setSavedConfig(config);
      setStatus({ type: 'success', msg: result.restartRequired ? 'Sessão encerrada. Reiniciando para aplicar a conexão...' : 'Configurações salvas.' });
      setTimeout(() => setStatus(null), 4000);
    } catch (error) { setStatus({ type: 'error', msg: error instanceof Error ? error.message : 'Não foi possível salvar a configuração.' }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await platform.setup.testConnection(config);
      setStatus(result.success
        ? { type: 'success', msg: config.connectionMode === 'remote' ? 'Servidor HTTPS e banco de dados acessíveis.' : 'Conexão bem-sucedida! Banco de dados acessível.' }
        : { type: 'error', msg: 'Falha: ' + result.error }
      );
    } catch (error) { setStatus({ type: 'error', msg: error instanceof Error ? error.message : 'Falha no teste de conexão.' }); }
    finally { setTesting(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6">
      {/* Abas */}
      <div className="flex items-center gap-4 border-b border-line">
        <button onClick={() => setTab('db')} className={`ui-button pb-4 px-2 text-sm font-medium transition-colors relative ${tab === 'db' ? 'text-brand' : 'text-muted hover:text-ink'}`}>
          Conexão
          {tab === 'db' && <motion.div layoutId="activeSetup" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>
        <button onClick={() => setTab('admin')} className={`ui-button pb-4 px-2 text-sm font-medium transition-colors relative ${tab === 'admin' ? 'text-brand' : 'text-muted hover:text-ink'}`}>
          Administrador
          {tab === 'admin' && <motion.div layoutId="activeSetup" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>
        <button onClick={() => setTab('logs')} className={`ui-button pb-4 px-2 text-sm font-medium transition-colors relative ${tab === 'logs' ? 'text-brand' : 'text-muted hover:text-ink'}`}>
          Logs
          {tab === 'logs' && <motion.div layoutId="activeSetup" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
        </button>
      </div>

      {tab === 'logs' && <AuditLogs />}

      {tab === 'admin' && <AdminUserManager />}

      {tab === 'db' && !platform.capabilities().connectionConfiguration && <div className="ui-panel p-6 text-muted">A configuração de conexão MariaDB está disponível somente no aplicativo desktop.</div>}
      {tab === 'db' && platform.capabilities().connectionConfiguration && (
        <>
      {/* Configuração do banco */}
      <div className="ui-panel bg-surface rounded-2xl  border border-line overflow-hidden">
        <div className="p-8 border-b border-line">
          <h2 className="ui-page-title text-2xl font-medium text-ink">Conexão</h2>
          <p className="text-muted">Escolha a conexão usada pelo aplicativo após reiniciar.</p>
        </div>
        <form onSubmit={handleSave} className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-connection-mode">Modo de conexão</label>
            <select id="mf-connection-mode" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line" value={config.connectionMode ?? 'local'} onChange={e => setConfig({ ...config, connectionMode: e.target.value as 'local' | 'remote' })}>
              <option value="local">MariaDB local/rede</option>
              <option value="remote">Servidor remoto HTTPS</option>
            </select>
          </div>
          {config.connectionMode === 'remote' ? (
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-server-url">URL HTTPS do servidor</label>
              <input type="url" required className="ui-field w-full px-4 py-2 rounded-lg border border-control-line" placeholder="https://farmacia.exemplo.com" value={config.serverUrl ?? ''} onChange={e => setConfig({ ...config, serverUrl: e.target.value })} id="mf-server-url" />
              <p className="mt-2 text-sm text-muted">O modo remoto usa somente o servidor configurado. Não haverá conexão alternativa com o MariaDB local.</p>
            </div>
          ) : <>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-settingsmanager-1" >IP do Servidor</label>
              <input type="text" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none" value={config.host} onChange={e => setConfig({ ...config, host: e.target.value })}  id="mf-settingsmanager-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-settingsmanager-2" >Porta</label>
              <input type="number" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none" value={config.port} onChange={e => setConfig({ ...config, port: Number(e.target.value) })}  id="mf-settingsmanager-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-settingsmanager-3" >Usuário</label>
              <input type="text" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none" value={config.user} onChange={e => setConfig({ ...config, user: e.target.value })}  id="mf-settingsmanager-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-settingsmanager-4" >Senha</label>
              <input type="password" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none" value={config.password} onChange={e => setConfig({ ...config, password: e.target.value })}  id="mf-settingsmanager-4" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1" htmlFor="mf-settingsmanager-5" >Nome do Banco</label>
            <input type="text" className="ui-field w-full px-4 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none" value={config.database} onChange={e => setConfig({ ...config, database: e.target.value })}  id="mf-settingsmanager-5" />
          </div>
          </>}
          {status && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${status.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
              {status.type === 'success' ? <Wifi className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
              {status.msg}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleTest} disabled={testing} className="ui-button flex-1 border border-control-line text-ink font-semibold py-2 rounded-lg hover:bg-canvas disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
              <Wifi className="w-4 h-4" /> {testing ? 'Testando...' : 'Testar Conexão'}
            </button>
            <button type="submit" disabled={saving}  className="ui-button ui-button-primary flex-1 text-on-coral hover:opacity-90 font-semibold py-2 rounded-lg disabled:opacity-60 transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
        {config.connectionMode !== 'remote' && <div className="p-5 bg-warning-soft border-t border-warning-line">
          <p className="text-sm text-warning"><strong>Atenção:</strong> o servidor MariaDB deve aceitar conexões remotas e o firewall deve liberar a porta 3306.</p>
          <p className="text-sm text-warning mt-2"><strong>Importante:</strong> usuarios configurados com autenticacao Windows/GSSAPI (`auth_gssapi_client`) nao sao suportados por esta versao do app. Use um usuario MariaDB com senha normal, como `mysql_native_password`.</p>
        </div>
        }
      </div>
        </>
      )}
    </motion.div>
  );
}
