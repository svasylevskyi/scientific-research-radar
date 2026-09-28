import { createResourceLoader } from "../resourceLoading";
import { startPagePolling } from "../pagePolling";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  initializationRetryAt: number;
  initializationRetrying: boolean;
  retryInitialization: () => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<EmailVerification>;
  confirmRegistration: (id: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const stopInitialization = useRef(() => {});
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationRetryAt, setInitializationRetryAt] = useState(0);
  const [initializationRetrying, setInitializationRetrying] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const retryInitialization = useCallback(() => setInitializationAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setIsInitializing(true);
    setInitializationError(null);
    const resource = createResourceLoader(async () => {
      try { return await authApi.refresh(); }
      catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    }, state => {
      if (!active) return;
      if (!state.error) setUser(state.data?.user ?? null);
      setInitializationError(state.error || null);
      setInitializationRetryAt(state.retryAt);
      setInitializationRetrying(state.retrying);
      setIsInitializing(false);
    });
    const stop = startPagePolling(() => resource.refresh(), 0, undefined, resource.nextAllowedAt);
    const dispose = () => { active = false; stop(); resource.stop(); };
    stopInitialization.current = dispose;
    return dispose;
  }, [initializationAttempt]);

  useEffect(() => {
    const clearExpiredSession = () => {
      stopInitialization.current(); setIsInitializing(false); setInitializationError(null); setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearExpiredSession);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await authApi.login(input);
    stopInitialization.current();
    setIsInitializing(false);
    setInitializationError(null);
    setUser(session.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    return authApi.register(input);
  }, []);

  const confirmRegistration = useCallback(async (id: string, code: string) => {
    const session = await authApi.confirmRegistration(id, code);
    stopInitialization.current();
    setIsInitializing(false);
    setInitializationError(null);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    stopInitialization.current();
    await authApi.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const value = useMemo(
    () => ({ user, isInitializing, initializationError, initializationRetryAt, initializationRetrying, retryInitialization, login, register, confirmRegistration, logout, refreshUser }),
    [user, isInitializing, initializationError, initializationRetryAt, initializationRetrying, retryInitialization, login, register, confirmRegistration, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
