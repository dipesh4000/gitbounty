"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE, api, type User } from "../lib/api";

type AuthContextValue = {
  user: User | null;
  connect: (placement: "nav" | "page") => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<User>("/api/me").then(setUser).catch(() => setUser(null));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    connect: (placement) => {
      if (!user) {
        // The OAuth route belongs to the separately hosted API, not this Next.js app.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`${API_BASE}/auth/github`);
        return;
      }
      if (placement === "page") {
        document.getElementById("bounties")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      api("/auth/logout", { method: "POST" })
        .catch(() => undefined)
        .finally(() => window.location.reload());
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
