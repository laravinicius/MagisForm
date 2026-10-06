export type UserRole = 'employee' | 'pharmacist' | 'manager' | 'admin';
export interface User { id: number; name: string; username: string; role: UserRole }

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  employee: 'Funcionário',
  pharmacist: 'Farmacêutico',
  manager: 'Gerente',
  admin: 'Administrador',
};

export const canManageUsers = (role: UserRole) => role !== 'employee';
export interface Customer { id: number; name: string; phone: string | null; responsible_id?: number | null; responsible_name?: string | null; responsible_phone?: string | null; created_at?: string }
export interface Insumo { id: number; name: string; created_at?: string }
export interface FormulaItem { insumo_id: number; insumo_name: string; quantity: number; unit?: string }
export interface BudgetItem { quantity: number; unit: string; value: number; is_selected?: boolean }
export interface Formula {
  id: number; customer_id: number; customer_name: string; customer_phone: string; responsible_name?: string | null;
  attendant_name: string; status: 'pending' | 'confirmed' | 'cancelled' | 'delivered';
  created_at: string; items: FormulaItem[]; budget_number?: string; budget_items?: BudgetItem[];
  delivery_date?: string | null;
  delivered_at?: string | null;
  payment_status?: string; partial_payment_amount?: number | string | null; payment_method?: string | null;
  delivery_status?: string; manager_verified?: boolean | number; cancel_reason?: string | null;
}
export interface SavedFormulaItem { insumo_id: number; insumo_name?: string; quantity: number; unit?: string }
export interface SavedFormula { id: number; name: string; budget_number?: string; created_at?: string; items: SavedFormulaItem[]; budget_items?: BudgetItem[] }
