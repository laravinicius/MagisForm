import React from 'react';
import { COLORS } from '../../config/branding';

export function NavItem({ icon, label, active, onClick, collapsed }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; collapsed: boolean
}) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      style={active
        ? { background: COLORS.navActiveBg, color: COLORS.onSecondary }
        : undefined}
      className={`ui-button ui-nav w-full flex items-center rounded-lg ${
        active ? 'font-semibold' : 'text-nav-muted hover:text-surface hover:bg-nav-active'
      }`}>
      <span aria-hidden="true" style={active ? { color: COLORS.navActive } : undefined}>{icon}</span>
      {!collapsed && <span className="min-w-0 break-words text-left">{label}</span>}
    </button>
  );
}
