import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AUTH_CHANGED_EVENT,
  getAvatarInitials,
  getSession,
  initializeAuth,
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  updateProfile as authUpdateProfile,
  type AuthSession,
} from '@/lib/auth';

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  avatarInitials: string;
  login: (email: string, password: string) => Promise<ReturnType<typeof authLogin>>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
  }) => Promise<ReturnType<typeof authRegister>>;
  logout: () => void;
  updateProfile: (data: { firstName: string; lastName: string; phone: string }) => ReturnType<typeof authUpdateProfile>;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    initializeAuth();
    refreshSession();
    setIsLoading(false);
    const onAuthChange = () => refreshSession();
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChange);
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authLogin(email, password);
    if (result.success && result.session) {
      setSession(result.session);
    }
    return result;
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
    }) => {
      const result = await authRegister(data);
      if (result.success && result.session) {
        setSession(result.session);
      }
      return result;
    },
    []
  );

  const logout = useCallback(() => {
    authLogout();
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    (data: { firstName: string; lastName: string; phone: string }) => {
      const result = authUpdateProfile(data);
      if (result.success && result.session) {
        setSession(result.session);
      }
      return result;
    },
    []
  );

  const avatarInitials = useMemo(
    () => (session ? getAvatarInitials(session.firstName, session.lastName) : ''),
    [session]
  );

  const value = useMemo(
    () => ({
      session,
      isLoading,
      isAuthenticated: !!session,
      avatarInitials,
      login,
      register,
      logout,
      updateProfile,
      refreshSession,
    }),
    [session, isLoading, avatarInitials, login, register, logout, updateProfile, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

