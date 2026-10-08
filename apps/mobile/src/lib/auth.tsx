import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, clearSession, loadServer, refreshSession, saveSession, setSignedOutHandler } from "./api";
import type { AuthUser } from "./types";

type Status = "loading" | "signedOut" | "signedIn";
type LoginResult = { ok: true } | { twoFactor: true };

interface AuthState {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string, totp?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const signOutLocal = useCallback(() => {
    qc.clear();
    setUser(null);
    setStatus("signedOut");
  }, [qc]);

  const reload = useCallback(async () => {
    setUser(await api<AuthUser>("/auth/me"));
    setStatus("signedIn");
  }, []);

  useEffect(() => {
    setSignedOutHandler(signOutLocal);
    (async () => {
      await loadServer();
      if (await refreshSession()) await reload().catch(signOutLocal);
      else setStatus("signedOut");
    })();
  }, [reload, signOutLocal]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      async login(email, password, totp) {
        const res = await api<{ requiresTwoFactor: true } | { user: AuthUser; tokens: { accessToken: string; refreshToken: string } }>("/auth/login", {
          method: "POST",
          body: { email, password, ...(totp ? { totp } : {}) },
        });
        if ("requiresTwoFactor" in res) return { twoFactor: true };
        await saveSession(res.tokens);
        setUser(res.user);
        setStatus("signedIn");
        return { ok: true };
      },
      async logout() {
        await clearSession();
        signOutLocal();
      },
      reload,
      can: (p) => !!user?.permissions.includes(p),
    }),
    [status, user, reload, signOutLocal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
