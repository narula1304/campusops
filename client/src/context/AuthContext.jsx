import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';
import useSocket from '../hooks/useSocket';

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

  // Socket.IO — driven by the auth state owned here to avoid circular deps
  const isAuthenticated = Boolean(token);
  const { socket, on } = useSocket({ token, isAuthenticated });

  const value = {
    user,
    token,
    login,
    logout,
    isAuthenticated,
    isLoading,
    socket,
    on,
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
