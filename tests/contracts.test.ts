import { describe, expect, it } from 'vitest';
import { fixtureCustomer, fixtureFormula, fixtureUser } from './fixtures/contracts';
import { getDeliveryTimestamp } from '../core/deliveryTime';

describe('contratos compartilhados', () => {
  it('mantém DTOs públicos livres de credenciais, hashes e tokens', () => {
    const serialized = JSON.stringify({ user: fixtureUser, customer: fixtureCustomer, formula: fixtureFormula });
    expect(serialized).not.toMatch(/password|token|secret|credential/i);
  });

  it('preserva os formatos numéricos e civis existentes nos DTOs', () => {
    expect(fixtureFormula.budget_items?.[0].value).toBe(12.5);
    expect(fixtureFormula.created_at).toBe('2026-10-08 12:00:00');
  });

  it('formata a data efetiva de entrega no horário civil de São Paulo', () => {
    expect(getDeliveryTimestamp(new Date('2026-10-08T02:30:00.000Z'))).toBe('2026-10-07 23:30:00');
  });
});
