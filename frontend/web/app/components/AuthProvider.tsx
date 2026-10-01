"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE, ApiError, api, type User } from "../lib/api";

/*
  The one place the website decides who is signed in.

  There is no demo, stub or hard-coded user here. `/api/me` is the only source of identity, and the
  "Connect GitHub" buttons send the visitor to the backend's real OAuth route. If the backend is not
  configured or not running, that is reported as such rather than papered over -- a page that invents a
  signed-in user is worse than a page that says it cannot reach the API.
*/

/** What we actually know about the visitor, as four distinct states rather than one nullable user. */
export type AuthStatus =
  | "loading"       // the first /api/me call has not come back yet
  | "signed-out"    // /api/me said 401: nobody is signed in
  | "signed-in"     // /api/me returned an account
  | "unavailable";  // the API could not be reached, or is not configured (503, network error)

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  /** Why the API could not answer, when status is "unavailable". Safe to show to a visitor. */
  error: string;
  /** Start real GitHub OAuth at the backend. */
  signIn: () => void;
  /** End the backend session and return to the landing page. */
  signOut: () => void;
  /** Re-read /api/me, for example after returning from the OAuth callback. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type Session = { status: AuthStatus; user: User | null; error: string };

/** Ask the API who is signed in and turn the answer -- including its failures -- into one of four states. */
async function readSession(): Promise<Session> {
  try {
    return { status: "signed-in", user: await api<User>("/api/me"), error: "" };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      return { status: "signed-out", user: null, error: "" };
    }
    return {
      status: "unavailable",
      user: null,
      error: caught instanceof ApiError
        ? caught.message
        : `Could not reach the GitBounty API at ${API_BASE}.`,
    };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading", user: null, error: "" });

  /* The setState happens in the promise callback, never synchronously in the effect body, and the
     active flag stops a response that arrives after unmount from writing to a dead component. */
  useEffect(() => {
    let active = true;
    void readSession().then((next) => { if (active) setSession(next); });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => { setSession(await readSession()); }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status: session.status,
    user: session.user,
    error: session.error,
    signIn: () => { window.location.assign(`${API_BASE}/auth/github`); },
    signOut: () => {
      // The session cookie belongs to the API's origin, so only the API can clear it. Navigate away
      // regardless: a logout that appears to do nothing because the request failed is misleading.
      api("/auth/logout", { method: "POST" })
        .catch(() => undefined)
        .finally(() => window.location.assign("/"));
    },
    refresh,
  }), [refresh, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
