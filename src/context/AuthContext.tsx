import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { ApiError, authApi, getToken, setToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  role: 'citizen' | 'authority' | 'admin' | 'guest';
  isStaff: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: { name: string; email: string; password: string; phone?: string; ward?: string }) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (payload: { name: string; phone?: string; ward?: string }) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: current } = await authApi.me();
        if (!cancelled) setUser(current);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user: nextUser } = await authApi.login(email, password);
    setToken(token);
    setUser(nextUser);
    return nextUser;
  };

  const register = async (payload: { name: string; email: string; password: string; phone?: string; ward?: string }) => {
    const { token, user: nextUser } = await authApi.register(payload);
    setToken(token);
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    try {
      if (getToken()) await authApi.logout();
    } catch {
      /* session may already be expired */
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const updateProfile = async (payload: { name: string; phone?: string; ward?: string }) => {
    const { user: nextUser } = await authApi.updateProfile(payload);
    setUser(nextUser);
    return nextUser;
  };

  const role: 'citizen' | 'authority' | 'admin' | 'guest' = user ? user.role : 'guest';
  const isStaff = role === 'authority' || role === 'admin';

  return (
    <AuthContext.Provider value={{ user, role, isStaff, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
