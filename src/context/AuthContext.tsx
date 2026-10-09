import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  sessionToken: string | null;
  setAuth: (user: User | null, token: string | null) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const setAuth = useCallback((u: User | null, token: string | null) => {
    setUser(u);
    setSessionToken(token);
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setSessionToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, sessionToken, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
