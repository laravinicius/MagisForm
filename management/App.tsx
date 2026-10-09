import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, AlertCircle, Check, ChevronDown, CircleHelp, CirclePlus, Clipboard, Container, Download, ExternalLink, LoaderCircle, LogOut, Play, RefreshCw, Server, ShieldCheck, Square, X } from 'lucide-react';

type ContainerInfo = { name: string; service: string; image: string; state: string; health: string | null };
type Installation = { id: string; name: string; host: string; image: string; status: string; createdAt: string; containers: ContainerInfo[] };
type FormValues = { id: string; host: string; name: string; adminName: string; adminUsername: string; image: string };
type Credentials = { name: string; username: string; password: string };
type PackageFiles = { id: string; host: string; name: string; image: string; compose: string; envExample: string; instructions: string };

const API = '/api/manager/v1';
let csrfToken = '';

async function refreshCsrf() {
  const response = await fetch(`${API}/auth/csrf`, { credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok) throw new Error('Não foi possível iniciar uma sessão segura.');
  csrfToken = body.data.csrfToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body) headers.set('content-type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', csrfToken);
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível concluir a solicitação.');
  return body.data as T;
}

function friendlyState(container: ContainerInfo) {
  if (container.health === 'healthy') return 'Saudável';
  if (container.health === 'unhealthy') return 'Com falha';
  if (container.health === 'starting') return 'Iniciando';
  if (container.state === 'running') return 'Em execução';
  if (container.state === 'exited' || container.state === 'created') return 'Parado';
  if (container.state === 'unavailable') return 'Docker indisponível';
  return container.state || 'Desconhecido';
}

function stateTone(container?: ContainerInfo) {
  if (!container || container.state === 'unavailable' || container.health === 'unhealthy') return 'danger';
  if (container.health === 'starting' || container.state === 'created') return 'warning';
  if (container.state === 'running') return 'success';
  return 'muted';
}

function slugify(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 31);
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export function App() {
  const [user, setUser] = useState('');
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [approvedImages, setApprovedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [values, setValues] = useState<FormValues>({ id: '', host: '', name: '', adminName: '', adminUsername: 'admin', image: '' });
  const createForm = useRef<HTMLFormElement>(null);

  const fetchInstallations = useCallback(async () => {
    const data = await request<Installation[]>('/installations'); setInstallations(data);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try { await refreshCsrf(); const me = await request<{ username: string }>('/auth/me'); if (!alive) return; setUser(me.username); }
      catch { /* Sessão ausente ou expirada. */ }
      finally { if (alive) setChecking(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [, config] = await Promise.all([fetchInstallations(), request<{ approvedImages: string[] }>('/config')]);
        if (alive) { setApprovedImages(config.approvedImages); setValues((previous) => ({ ...previous, image: previous.image || config.approvedImages[0] || '' })); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Falha ao consultar Docker.'); }
      finally { if (alive) setLoading(false); }
    };
    void load(); const timer = window.setInterval(() => { void fetchInstallations().catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha na atualização.')); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [user, fetchInstallations]);

  const summary = useMemo(() => {
    const running = installations.filter((item) => item.containers.some((container) => container.state === 'running')).length;
    const attention = installations.filter((item) => item.containers.some((container) => container.health === 'unhealthy' || container.state === 'unavailable')).length;
    return { total: installations.length, running, attention };
  }, [installations]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoginError('');
    const data = new FormData(event.currentTarget);
    try {
      await refreshCsrf();
      const result = await request<{ username: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password'), totp: data.get('totp') }) });
      setUser(result.username);
    } catch { setLoginError('Usuário, senha ou código autenticador inválido.'); }
  }

  async function logout() {
    try { await request('/auth/logout', { method: 'POST', body: '{}' }); } catch { /* A sessão pode já ter expirado. */ }
    setUser(''); setInstallations([]); setCredentials(null); await refreshCsrf();
  }

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'name' && !previous.id) next.id = slugify(String(value));
      return next;
    });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyId('creating'); setError(''); setMessage('');
    try {
      const created = await request<Credentials>('/installations', { method: 'POST', body: JSON.stringify(values) });
      setCredentials(created); setFormOpen(false); setMessage(`A instalação ${values.name} foi criada. Configure o Proxy Host no NPM para liberar o domínio.`);
      setValues({ id: '', host: '', name: '', adminName: '', adminUsername: 'admin', image: approvedImages[0] || '' }); await fetchInstallations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível provisionar a instalação.'); }
    finally { setBusyId(''); }
  }

  async function generatePackage() {
    if (!createForm.current?.reportValidity()) return;
    setBusyId('package'); setError(''); setMessage('');
    try {
      const files = await request<PackageFiles>('/installations/package', { method: 'POST', body: JSON.stringify(values) });
      download(`${files.id}-compose.yaml`, files.compose); download(`${files.id}-.env.example`, files.envExample); download(`${files.id}-INSTRUCOES.md`, files.instructions);
      setMessage('Pacote Docker gerado. Complete os segredos e a sub-rede no servidor antes de aplicar.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o pacote.'); }
    finally { setBusyId(''); }
  }

  async function doAction(item: Installation, action: 'start' | 'stop' | 'restart') {
    if (action === 'stop' && !window.confirm(`Parar os serviços de ${item.name}? O acesso à instalação ficará indisponível.`)) return;
    setBusyId(`${item.id}:${action}`); setError(''); setMessage(''); setMenuId('');
    try { await request(`/installations/${item.id}/actions`, { method: 'POST', body: JSON.stringify({ action }) }); await fetchInstallations(); setMessage(`${item.name}: ação concluída.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'A operação Docker falhou.'); }
    finally { setBusyId(''); }
  }

  if (checking) return <main className="manager-loading" aria-live="polite"><LoaderCircle className="spin" aria-hidden="true" /> Verificando sessão…</main>;
  if (!user) return <main className="login-page">
    <section className="login-card ui-panel" aria-labelledby="login-title">
      <img className="brand-logo" src="/brand/logo-horizontal-green.svg" alt="MagisForm" />
      <p className="eyebrow">OPERAÇÃO DA PLATAFORMA</p><h1 id="login-title" className="ui-page-title">Acesso à gestão</h1>
      <p className="login-copy">Entre com a conta de operador e o código do aplicativo autenticador.</p>
      <form className="manager-form" onSubmit={login}>
        <label>Usuário<input className="ui-field" name="username" autoComplete="username" required /></label>
        <label>Senha<input className="ui-field" name="password" type="password" autoComplete="current-password" required /></label>
        <label>Código autenticador<input className="ui-field totp-field" name="totp" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} required /></label>
        {loginError && <p className="feedback error" role="alert"><AlertCircle size={18} />{loginError}</p>}
        <button className="ui-button ui-button-primary login-submit" type="submit"><ShieldCheck size={18} /> Entrar com segurança</button>
      </form>
      <p className="login-note"><ShieldCheck size={16} /> Sessões protegidas com senha e TOTP</p>
    </section>
  </main>;

  return <main className="manager-shell">
    <header className="manager-header">
      <div className="manager-brand"><img className="brand-logo" src="/brand/logo-horizontal-green.svg" alt="MagisForm" /><span className="brand-divider" /><span className="brand-caption">Gestão de instalações</span></div>
      <div className="header-actions"><span className="operator-name"><ShieldCheck size={16} />{user}</span><button className="ui-button ui-button-secondary logout-button" onClick={() => void logout()}><LogOut size={17} /> Sair</button></div>
    </header>
    <div className="manager-content">
      <section className="page-intro">
        <div><p className="eyebrow">CENTRAL DE OPERAÇÕES</p><h1 className="ui-page-title">Instalações</h1><p className="page-description">Acompanhe os ambientes MagisForm e gerencie os serviços de cada empresa.</p></div>
        <div className="intro-actions"><span className="refresh-status"><Activity size={16} /> Atualização automática a cada 15 s</span><button className="ui-button ui-button-primary create-button" onClick={() => setFormOpen(true)} disabled={!approvedImages.length}><CirclePlus size={19} /> Nova instalação</button></div>
      </section>
      {!approvedImages.length && <p className="feedback warning" role="status"><CircleHelp size={18} /> Configure uma imagem aprovada por digest no serviço de gestão para habilitar o provisionamento.</p>}
      {message && <p className="feedback success" role="status"><Check size={18} />{message}</p>}
      {error && <p className="feedback error" role="alert"><AlertCircle size={18} />{error}</p>}
      <section className="summary-grid" aria-label="Resumo das instalações">
        <article className="summary-card ui-panel"><span className="summary-icon"><Container size={20} /></span><div><span className="summary-label">Empresas cadastradas</span><strong>{summary.total}</strong></div></article>
        <article className="summary-card ui-panel"><span className="summary-icon success-icon"><Activity size={20} /></span><div><span className="summary-label">Com serviços ativos</span><strong>{summary.running}</strong></div></article>
        <article className="summary-card ui-panel"><span className="summary-icon warning-icon"><AlertCircle size={20} /></span><div><span className="summary-label">Precisam de atenção</span><strong>{summary.attention}</strong></div></article>
      </section>
      <section className="installations-section" aria-labelledby="installations-heading">
        <div className="section-heading"><div><h2 id="installations-heading">Ambientes de clientes</h2><p>Estado individual dos containers de aplicação e banco.</p></div><button className="ui-button refresh-button" onClick={() => void fetchInstallations()} disabled={loading} aria-label="Atualizar instalações"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button></div>
        {!installations.length ? <div className="empty-state ui-panel"><span className="empty-icon"><Server size={25} /></span><h3>Nenhuma instalação cadastrada</h3><p>Crie uma instalação para começar ou gere um pacote Docker para aplicar manualmente.</p><button className="ui-button ui-button-primary" onClick={() => setFormOpen(true)} disabled={!approvedImages.length}><CirclePlus size={18} /> Criar primeira instalação</button></div> : <div className="installation-list">
          {installations.map((item) => {
            const appContainer = item.containers.find((container) => container.service === 'app');
            const dbContainer = item.containers.find((container) => container.service === 'db');
            const working = busyId.startsWith(`${item.id}:`);
            return <article className="tenant-card ui-panel" key={item.id}>
              <div className="tenant-main">
                <div className="tenant-identity"><span className="tenant-avatar"><Container size={20} /></span><div><h3>{item.name}</h3><a href={`https://${item.host}`} target="_blank" rel="noreferrer">{item.host}<ExternalLink size={13} /></a><span className="tenant-id">ID: {item.id} · {item.status === 'provisioned' ? 'Provisionada' : item.status === 'provisioning' ? 'Provisionamento pendente' : 'Preparada'}</span></div></div>
                <div className="container-statuses"><ContainerStatus label="Aplicação" item={appContainer} /><ContainerStatus label="Banco" item={dbContainer} /></div>
                <div className="tenant-version"><span>Imagem</span><code title={item.image}>{item.image.split('@')[0]}<br />{item.image.split('@')[1]?.slice(0, 19) || 'digest indisponível'}</code></div>
                <div className="tenant-actions">
                  <button className="ui-button action-button" onClick={() => setMenuId(menuId === item.id ? '' : item.id)} aria-expanded={menuId === item.id} aria-haspopup="menu" disabled={Boolean(working)}>{working ? <LoaderCircle size={16} className="spin" /> : <>Ações <ChevronDown size={16} /></>}</button>
                  {menuId === item.id && <div className="action-menu" role="menu">
                    <button role="menuitem" onClick={() => void doAction(item, 'start')}><Play size={15} /> Iniciar</button>
                    <button role="menuitem" onClick={() => void doAction(item, 'restart')}><RefreshCw size={15} /> Reiniciar</button>
                    <button role="menuitem" onClick={() => void doAction(item, 'stop')}><Square size={15} /> Parar</button>
                  </div>}
                </div>
              </div>
            </article>;
          })}
        </div>}
      </section>
      <footer className="manager-footer"><span>MagisForm Gestão</span><span>As instalações têm bancos e volumes separados.</span></footer>
    </div>
    {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setFormOpen(false); }}><section className="manager-modal ui-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <div className="modal-heading"><div><p className="eyebrow">NOVA EMPRESA</p><h2 id="create-title" className="ui-page-title">Criar instalação</h2></div><button className="ui-button close-button" aria-label="Fechar" onClick={() => setFormOpen(false)} disabled={Boolean(busyId)}><X size={20} /></button></div>
      <form ref={createForm} className="manager-form" onSubmit={submitCreate}>
        <label>Nome da empresa<input className="ui-field" value={values.name} onChange={(event) => updateField('name', event.target.value)} maxLength={80} required /></label>
        <div className="form-two-columns"><label>Identificador<input className="ui-field" value={values.id} onChange={(event) => updateField('id', slugify(event.target.value))} maxLength={31} pattern="[a-z][a-z0-9-]{1,30}" required /><small>Gerado pelo nome; usado nos recursos Docker.</small></label><label>Domínio da empresa<input className="ui-field" type="text" value={values.host} onChange={(event) => updateField('host', event.target.value.toLowerCase())} placeholder="farmacia.exemplo.com.br" autoCapitalize="none" required /></label></div>
        <label>Versão aprovada da aplicação<select className="ui-field" value={values.image} onChange={(event) => updateField('image', event.target.value)} required>{approvedImages.map((image) => <option key={image} value={image}>{image.split('@')[0]} · {image.split('@')[1]?.slice(0, 15)}</option>)}</select></label>
        <div className="form-two-columns"><label>Nome do administrador inicial<input className="ui-field" value={values.adminName} onChange={(event) => updateField('adminName', event.target.value)} maxLength={120} required /></label><label>Usuário inicial<input className="ui-field" value={values.adminUsername} onChange={(event) => updateField('adminUsername', event.target.value)} maxLength={100} required /></label></div>
        <p className="form-note"><ShieldCheck size={16} /> Senhas do banco e do primeiro administrador são geradas individualmente. O acesso inicial será exibido uma única vez.</p>
        <div className="modal-actions"><button className="ui-button cancel-button" type="button" onClick={() => setFormOpen(false)} disabled={Boolean(busyId)}>Cancelar</button><button className="ui-button ui-button-secondary" type="button" onClick={() => void generatePackage()} disabled={Boolean(busyId)}>{busyId === 'package' ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />} Gerar pacote</button><button className="ui-button ui-button-primary" type="submit" disabled={Boolean(busyId)}>{busyId === 'creating' ? <LoaderCircle size={17} className="spin" /> : <CirclePlus size={17} />} Provisionar</button></div>
        {error && <p className="feedback error" role="alert"><AlertCircle size={18} />{error}</p>}
      </form>
    </section></div>}
    {credentials && <div className="modal-backdrop credential-backdrop"><section className="manager-modal credential-modal ui-dialog" role="dialog" aria-modal="true" aria-labelledby="credential-title"><span className="credential-icon"><ShieldCheck size={24} /></span><p className="eyebrow">ACESSO INICIAL</p><h2 id="credential-title" className="ui-page-title">Guarde estas credenciais</h2><p>Elas são exibidas uma única vez. Acesse a nova instalação depois de configurar o Proxy Host no NPM.</p><dl><dt>Administrador</dt><dd>{credentials.name}</dd><dt>Usuário</dt><dd>{credentials.username}</dd><dt>Senha inicial</dt><dd className="initial-password">{credentials.password}</dd></dl><div className="credential-actions"><button className="ui-button ui-button-secondary" onClick={() => { void navigator.clipboard.writeText(`Usuário: ${credentials.username}\nSenha: ${credentials.password}`).then(() => setCopied(true)); }}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? 'Copiado' : 'Copiar acesso'}</button><button className="ui-button ui-button-primary" onClick={() => { setCredentials(null); setCopied(false); }}>Guardei as credenciais</button></div></section></div>}
  </main>;
}

function ContainerStatus({ label, item }: { label: string; item?: ContainerInfo }) {
  return <div className="container-chip"><span className={`status-dot ${stateTone(item)}`} aria-hidden="true" /><div><span className="service-label">{label}</span><strong>{item ? friendlyState(item) : 'Não encontrado'}</strong>{item?.name && <small title={item.name}>{item.name}</small>}</div></div>;
}
