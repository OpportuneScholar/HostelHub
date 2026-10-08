import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking session
  useEffect(() => { api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);
  useEffect(() => {
    const out = () => setUser((u) => (u ? null : u));
    const must = () => setUser((u) => (u ? { ...u, mustChangePassword: true } : u));
    window.addEventListener('hostelhub:unauthorized', out); window.addEventListener('hostelhub:mustchange', must);
    return () => { window.removeEventListener('hostelhub:unauthorized', out); window.removeEventListener('hostelhub:mustchange', must); };
  }, []);
  const login = async (identifier, password, portal) => {
    const d = await api('/auth/login', { method: 'POST', body: { identifier, password, portal } });
    setUser(d.user); return d.user;
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); };
  return <Ctx.Provider value={{ user, setUser, login, logout }}>{children}</Ctx.Provider>;
}
