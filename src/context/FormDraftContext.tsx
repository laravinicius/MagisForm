import React, { createContext, useContext, useRef, useCallback, ReactNode, useState } from 'react';

interface FormDraftContextValue {
  getDraft<T = Record<string, unknown>>(id: string): T | null;
  saveDraft(id: string, data: Record<string, unknown>): void;
  removeDraft(id: string): void;
  clearDrafts(): void;
  hasDrafts: boolean;
}

const FormDraftContext = createContext<FormDraftContextValue | null>(null);

export function FormDraftProvider({ children }: { children: ReactNode }) {
  const draftsRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const [hasDrafts, setHasDrafts] = useState(false);

  const getDraft = useCallback(<T = Record<string, unknown>,>(id: string): T | null => {
    const d = draftsRef.current.get(id);
    return (d as T) ?? null;
  }, []);

  const saveDraft = useCallback((id: string, data: Record<string, unknown>) => {
    draftsRef.current.set(id, { ...data });
    setHasDrafts(draftsRef.current.size > 0);
  }, []);

  const removeDraft = useCallback((id: string) => {
    draftsRef.current.delete(id);
    setHasDrafts(draftsRef.current.size > 0);
  }, []);

  const clearDrafts = useCallback(() => {
    draftsRef.current.clear();
    setHasDrafts(false);
  }, []);

  return (
    <FormDraftContext.Provider value={{ getDraft, saveDraft, removeDraft, clearDrafts, hasDrafts }}>
      {children}
    </FormDraftContext.Provider>
  );
}

export function useFormDraft() {
  const ctx = useContext(FormDraftContext);
  if (!ctx) throw new Error('useFormDraft must be used within FormDraftProvider');
  return ctx;
}
