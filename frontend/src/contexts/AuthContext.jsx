import { createContext, useContext, useState, useEffect } from 'react';
import { authService, resetAuthExpiredFlag } from '../services/api';

const AuthContext = createContext(null);

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
  }, []);

  const fetchUser = async () => {
    try {
      const data = await authService.fetchUser(token);
      
      if (data.success) {
        setUser(data.data.user);
      } else {
        logout();
      }
    } catch (error) {
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
      if (remember) localStorage.setItem('remember_until', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
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

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('remember_until');
    setToken(null);
    setUser(null);
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
