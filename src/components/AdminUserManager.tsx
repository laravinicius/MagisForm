import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { db } from '../services/lanDatabase';
import { useData } from '../hooks/useData';
import { LoadingState, ErrorState } from './Feedback';
import { COLORS } from '../../config/branding';

export function AdminUserManager() {
  const { data: users, loading, error, reload } = useData('users', activity => db.users.list(activity));
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  const allUsers = (users as any[]) ?? [];
  const roleLabels: Record<string, string> = {
    admin: 'Administrador', manager: 'Gerente', pharmacist: 'Farmacêutico', employee: 'Funcionário',
  };

  const reset = () => {
    setForm({ name: '', username: '', password: '' });
    setEditingId(null);
    setFormError('');
  };

  const startEdit = (u: any) => {
    setForm({ name: u.name, username: u.username, password: '' });
    setEditingId(u.id);
    setFormError('');
    document.getElementById('admin-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!editingId && !form.password.trim()) {
      setFormError('Informe uma senha para o administrador.');
      return;
    }
    setSaving(true); setSuccess(null);
    try {
      if (editingId) {
        const res: any = await db.users.update(editingId, {
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password.trim() || undefined,
          role: 'admin',
        });
        if (res && res.success === false) {
          setFormError(res.error ?? 'Erro ao salvar. Tente novamente.');
          return;
        }
      } else {
        const res: any = await db.users.add({
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password.trim(),
          role: 'admin',
        });
        if (res && res.success === false) {
          setFormError(res.error ?? 'Erro ao salvar. Tente novamente.');
          return;
        }
      }
      const wasEditing = editingId !== null;
      reset(); reload();
      setSuccess(wasEditing ? 'Alterações salvas com sucesso!' : 'Administrador criado! Use estas credenciais para acessar o sistema.');
    } catch (err: any) {
      setFormError(err?.message ?? 'Erro ao salvar. Tente novamente.');
    } finally { setSaving(false); }
  };

  const isEditing = editingId !== null;

  return (
    <div className="ui-panel bg-surface rounded-2xl  border border-line overflow-hidden">
      <div className="p-8 border-b border-line">
        <h2 className="ui-page-title text-2xl font-medium text-ink">Usuário administrador</h2>
        <p className="text-muted">
          Crie o administrador com acesso ao sistema completo (fórmulas, clientes, funcionários).
        </p>
        <p className="text-xs text-muted mt-2">
          Diferente do login de configuração <code className="font-mono">admin</code> / <code className="font-mono">admin123</code>,
          que só acessa esta tela de servidor.
        </p>
      </div>

      {/* Formulário */}
      <div id="admin-form" className={`p-6 border-b border-line transition-colors ${isEditing ? 'bg-info-soft' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide">
            {isEditing ? 'Editando administrador' : 'Novo administrador'}
          </h3>
          {isEditing && (
            <button type="button" onClick={reset}
              className="ui-button text-xs text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-row-alt transition-colors">
              Cancelar edição
            </button>
          )}
        </div>

        {success && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-success-soft text-success border border-success-line">
            <CheckCircle className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1" htmlFor="mf-adminusermanager-1" >Nome completo</label>
            <input required type="text"
              className="ui-field w-full px-3 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none bg-surface"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}  id="mf-adminusermanager-1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1" htmlFor="mf-adminusermanager-2" >Usuário de acesso</label>
            <input required type="text"
              className="ui-field w-full px-3 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none bg-surface"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}  id="mf-adminusermanager-2" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1" htmlFor="mf-adminusermanager-3" >
              Senha {isEditing && <span className="text-muted font-normal normal-case">(em branco = não altera)</span>}
            </label>
            <input required={!isEditing} type="password"
              className="ui-field w-full px-3 py-2 rounded-lg border border-control-line focus:ring-2 focus:ring-brand outline-none bg-surface"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}  id="mf-adminusermanager-3" />
          </div>
          <div className="space-y-1">
            {formError && (
              <p className="text-xs text-danger font-medium bg-danger-soft px-2 py-1 rounded">{formError}</p>
            )}
            <button type="submit" disabled={saving}
              style={{ background: isEditing ? COLORS.secondary : COLORS.primary, color: isEditing ? COLORS.onSecondary : COLORS.onPrimary }}
              className="ui-button w-full text-white py-2 px-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition-all text-sm">
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : '+ Criar administrador'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide">Usuários cadastrados</h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-row-alt text-ink">{allUsers.length}</span>
        </div>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="ui-table w-full text-left">
              <thead>
                <tr className="border-b border-line bg-canvas text-muted text-xs uppercase font-semibold">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 bg-surface">
                {allUsers.map(u => (
                  <tr key={u.id} className={`transition-colors ${editingId === u.id ? 'bg-info-soft' : 'hover:bg-canvas'}`}>
                    <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                    <td className="px-4 py-3 text-muted font-mono text-sm">{u.username}</td>
                    <td className="px-4 py-3 text-sm text-muted">{roleLabels[u.role] ?? u.role}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {u.role === 'admin' && <button
                        onClick={() => editingId === u.id ? reset() : startEdit(u)}
                        className={`ui-button text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${editingId === u.id ? 'bg-row-alt text-muted hover:bg-sage' : 'text-info hover:bg-info-soft'}`}>
                        {editingId === u.id ? 'Cancelar' : 'Editar'}
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allUsers.length === 0 && (
              <p className="text-center py-10 text-muted">Nenhum usuário cadastrado ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
