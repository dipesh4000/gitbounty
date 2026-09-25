"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "../lib/api";

const DEMO_SESSION_KEY = "gitbounty_demo_session";
const DEMO_USER: User = {
  id: -1,
  github_id: 0,
  github_login: "aasha-malik",
  name: "Aasha Malik",
  avatar_url: null,
};

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
    if (window.localStorage.getItem(DEMO_SESSION_KEY) === "connected") {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }
    api<User>("/api/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    connect: (placement) => {
      if (!user) {
        window.localStorage.setItem(DEMO_SESSION_KEY, "connected");
        setUser(DEMO_USER);
        window.location.assign("/explore");
        return;
      }
      if (placement === "page") {
        document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      window.localStorage.removeItem(DEMO_SESSION_KEY);
      if (user.id === DEMO_USER.id) {
        setUser(null);
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
