'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type AuthContextValue = {
  isLoggedIn: boolean;
  userName: string;
  userEmail: string;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'cb_logged_in';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsLoggedIn(stored === '1');
      }
    } catch {
      // ignore storage access issues
    }
  }, []);

  const login = useCallback(() => {
    setIsLoggedIn(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '0');
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, userName: 'Nguyen Minh', userEmail: 'minh.nguyen@gmail.com', login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
