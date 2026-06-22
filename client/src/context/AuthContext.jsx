import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('campusops_token');
    const storedUser = localStorage.getItem('campusops_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        // Corrupt data — clear it
        localStorage.removeItem('campusops_token');
        localStorage.removeItem('campusops_user');
      }
    }

    setIsLoading(false);
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    const { token: newToken, user: newUser } = data;

    localStorage.setItem('campusops_token', newToken);
    localStorage.setItem('campusops_user', JSON.stringify(newUser));

    setToken(newToken);
    setUser(newUser);

    return data;
  };

  const logout = () => {
    localStorage.removeItem('campusops_token');
    localStorage.removeItem('campusops_user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    login,
    logout,
    isAuthenticated: Boolean(token),
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
