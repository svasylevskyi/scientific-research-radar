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
import { ApiError, AUTH_EXPIRED_EVENT } from "../api/client";
import type { LoginInput, RegisterInput, User } from "../types/auth";
import type { EmailVerification } from "../components/EmailVerificationForm";

interface AuthContextValue {
  user: User | null;
  isInitializing: boolean;
  initializationError: string | null;
  retryInitialization: () => void;
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
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const retryInitialization = useCallback(() => setInitializationAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setIsInitializing(true);
    setInitializationError(null);
    authApi
      .refresh()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else setInitializationError(error instanceof Error ? error.message : "Could not restore your session. Please retry.");
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });
    return () => {
      active = false;
    };
  }, [initializationAttempt]);

  useEffect(() => {
    const clearExpiredSession = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await authApi.login(input);
    setInitializationError(null);
    setUser(session.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    return authApi.register(input);
  }, []);

  const confirmRegistration = useCallback(async (id: string, code: string) => {
    const session = await authApi.confirmRegistration(id, code);
    setInitializationError(null);
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
    () => ({ user, isInitializing, initializationError, retryInitialization, login, register, confirmRegistration, logout, refreshUser }),
    [user, isInitializing, initializationError, retryInitialization, login, register, confirmRegistration, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
