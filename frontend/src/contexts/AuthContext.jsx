import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, resetAuthExpiredFlag } from '../services/api';

const AuthContext = createContext(null);

const REMEMBER_PREF_KEY = 'remember_login';
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRY_CHECK_INTERVAL_MS = 30 * 1000;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('remember_until');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [logout]);

  useEffect(() => {
    if (!token) return undefined;
    const checkExpiry = () => {
      const until = Number(localStorage.getItem('remember_until'));
      if (until && Date.now() >= until) logout();
    };
    checkExpiry();
    const intervalId = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) checkExpiry(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkExpiry);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkExpiry);
    };
  }, [token, logout]);

  const fetchUser = async () => {
    const currentToken = token;
    try {
      const data = await authService.fetchUser(currentToken);
      if (localStorage.getItem('token') !== currentToken) return;

      if (data.success) {
        setUser(data.data.user);
      } else {
        logout();
      }
    } catch (error) {
      if (localStorage.getItem('token') !== currentToken) return;
      console.error('Fetch user error:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (identifier, password, remember = false) => {
    const data = await authService.login(identifier, password, remember);
    
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem(REMEMBER_PREF_KEY, remember ? '1' : '0');
      if (remember) localStorage.setItem('remember_until', String(Date.now() + REMEMBER_DURATION_MS));
      else localStorage.removeItem('remember_until');
      resetAuthExpiredFlag();
      setToken(data.data.token);
      setUser(data.data.user);
      return { success: true };
    }
    return { success: false, message: data.message };
  };

  const register = async (full_name, email, phone, password) => {
    const data = await authService.register(full_name, email, phone, password);
    
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      resetAuthExpiredFlag();
      setToken(data.data.token);
      setUser(data.data.user);
      return { success: true };
    }
    return { success: false, message: data.message };
  };

  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isSales = user?.role === 'SALES';
  const isUser = user?.role === 'CTV' || user?.role === 'NPP';
  const canAccessPanel = ['SUPER_ADMIN', 'ADMIN', 'SALES'].includes(user?.role);
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading,
      login, 
      register, 
      logout,
      updateUser,
      isAdmin,
      isSuperAdmin,
      isSales,
      isUser,
      canAccessPanel,
      isAuthenticated
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
