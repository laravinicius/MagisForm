import React, { useMemo } from 'react';
import { ClipboardList, PlusCircle, Clock, CheckCircle2, Users, Cross } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../services/lanDatabase';
import { User, Formula } from '../types';
import { useData } from '../hooks/useData';

export function Dashboard({ user, onNavigate }: { user: User; onNavigate: (tab: any) => void }) {
  const { data: customers } = useData(() => db.customers.list());
  const { data: insumos } = useData(() => db.insumos.list());
  const { data: formulas } = useData(() => db.formulas.list());
  const pendingFormulas = useMemo(() => (formulas ?? []).filter((f: Formula) => f.status === 'pending').length, [formulas]);
  const confirmedFormulas = useMemo(() => (formulas ?? []).filter((f: Formula) => f.status === 'confirmed').length, [formulas]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
      <div>
        <h2 className="ui-page-title text-3xl font-medium text-ink">Bem-vindo, {user.name}</h2>
        <p className="text-muted">Aqui está o que está acontecendo na farmácia hoje.</p>
      </div>
      <div className="ui-stat-grid grid gap-4">
        <StatCard icon={<ClipboardList />} label="Fórmulas Totais" value={formulas?.length ?? 0} />
        <StatCard icon={<Clock />} label="Pendentes" value={pendingFormulas} />
        <StatCard icon={<CheckCircle2 />} label="Confirmadas" value={confirmedFormulas} />
        <StatCard icon={<Users />} label="Clientes" value={customers?.length ?? 0} />
        <StatCard icon={<Cross />} label="Insumos" value={insumos?.length ?? 0} />
      </div>
      <div className="ui-panel bg-surface p-6 rounded-2xl border border-line  max-w-2xl">
        <h3 className="text-lg font-semibold mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-3 gap-4">
          <QuickActionButton icon={<PlusCircle />} label="Nova Fórmula" onClick={() => onNavigate('recipe')} primary />
          <QuickActionButton icon={<Clock />} label="Pendentes" onClick={() => onNavigate('pending')} />
          <QuickActionButton icon={<CheckCircle2 />} label="Confirmadas" onClick={() => onNavigate('confirmed')} />
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="ui-panel ui-stat p-5 rounded-2xl">
      <div className="ui-icon-disc" aria-hidden="true">{icon}</div>
      <div><p className="text-sm text-muted font-medium">{label}</p><p className="text-2xl font-bold text-ink">{value}</p></div>
    </div>
  );
}

function QuickActionButton({ icon, label, onClick, primary = false }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`ui-button ui-quick-action flex flex-col items-center justify-center gap-3 rounded-xl ${primary ? 'ui-button-primary' : 'ui-button-secondary'}`}>
      <span aria-hidden="true">{icon}</span><span className="font-semibold">{label}</span>
    </button>
  );
}
