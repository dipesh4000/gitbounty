"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE, api, type User } from "../lib/api";
import { DEMO_CONNECT, DEMO_USER, demoSessionStarted, endDemoSession, setDemoActive, startDemoSession } from "../lib/demoSession";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  connect: (placement: "nav" | "page") => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<User>("/api/me")
      .then((me) => { setDemoActive(false); setUser(me); })
      .catch(() => {
        // No real session. Hard-coded sign-in (lib/demoSession.ts): once "Connect GitHub" was clicked,
        // the visitor stays connected as the demo user until they sign out.
        if (demoSessionStarted()) { setDemoActive(true); setUser(DEMO_USER); } else setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    connect: (placement) => {
      if (!user) {
        if (DEMO_CONNECT) {
          startDemoSession();
          window.location.assign("/explore");
          return;
        }
        window.location.assign(`${API_BASE}/auth/github`);
        return;
      }
      if (placement === "page") {
        window.location.assign("/explore");
        return;
      }
      const demoUser = user.id === DEMO_USER.id && user.github_login === DEMO_USER.github_login;
      endDemoSession();
      if (demoUser) {
        window.location.assign("/");
        return;
      }
      api("/auth/logout", { method: "POST" }).catch(() => undefined).finally(() => window.location.reload());
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
