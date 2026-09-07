import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { authApi } from "../api/auth";
import { AUTH_EXPIRED_EVENT } from "../api/client";
import type { LoginInput, RegisterInput, User } from "../types/auth";
import type { EmailVerification } from "../components/EmailVerificationForm";

interface AuthContextValue {
  user: User | null;
  isInitializing: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<EmailVerification>;
  confirmRegistration: (id: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    authApi
      .refresh()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const clearExpiredSession = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await authApi.login(input);
    setUser(session.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    return authApi.register(input);
  }, []);

  const confirmRegistration = useCallback(async (id: string, code: string) => {
    const session = await authApi.confirmRegistration(id, code);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const value = useMemo(
    () => ({ user, isInitializing, login, register, confirmRegistration, logout, refreshUser }),
    [user, isInitializing, login, register, confirmRegistration, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
