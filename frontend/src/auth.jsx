import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
const USER_KEY = 'casper_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) : null; } catch { return null; }
  });

  const save = (session) => {
    setToken(session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    setUser(session.user);
  };
  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('casper:unauthorized', logout);
    return () => window.removeEventListener('casper:unauthorized', logout);
  }, [logout]);

  const login = async (email, password) => save(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const register = async (form) => save(await api('/auth/register', { method: 'POST', body: form }));
  const demoLogin = async (role) => save(await api('/auth/demo', { method: 'POST', body: { role } }));   // only works when the server runs in demo mode

  return <Ctx.Provider value={{ user, login, register, demoLogin, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
}

// UI convenience only: the server re-checks the role on every admin request.
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <Outlet /> : <Navigate to="/" replace />;
}
