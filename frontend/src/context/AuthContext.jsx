import { createContext, useContext, useState, useEffect } from 'react';
import { capacityApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('surgelink_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await capacityApi.login(email, password);
      localStorage.setItem('surgelink_token', data.token);
      localStorage.setItem('surgelink_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('surgelink_token');
    localStorage.removeItem('surgelink_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function roleRedirect(role) {
  switch (role) {
    case 'hospital_admin':
      return '/hospital';
    case 'receiving_staff':
      return '/transfers';
    case 'regional_coordinator':
      return '/dashboard';
    default:
      return '/dashboard';
  }
}
