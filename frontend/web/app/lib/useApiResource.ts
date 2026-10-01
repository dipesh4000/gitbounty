"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

/*
  One GET, with its loading and error states, as a hook.

  Why a hook rather than three useStates per view: the obvious shape -- setLoading(true) at the top of an
  effect, then fetch -- sets state synchronously inside the effect body, which triggers a second render
  before the first has painted. React's own lint rule says so, and every list view in the app had the same
  pattern.

  Here, loading is *derived*. The state carries the request key it belongs to; when the key changes, the
  current state is stale by definition and the view renders as loading without anything being set. State is
  only ever written from the promise callback.
*/

export type Resource<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

type Loaded<T> = { key: string; status: "ready" | "error"; data: T | null; error: string | null };

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * Fetch `path` whenever it changes, or when the returned `reload` is called.
 *
 * `path` may be null to fetch nothing, which is how a view that depends on a choice the user has not made
 * yet stays idle rather than requesting something meaningless.
 */
export function useApiResource<T>(path: string | null): {
  resource: Resource<T>;
  reload: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const key = `${attempt}:${path ?? ""}`;

  useEffect(() => {
    if (path === null) return;
    let active = true;
    void api<T>(path).then(
      (data) => { if (active) setLoaded({ key, status: "ready", data, error: null }); },
      (error: unknown) => { if (active) setLoaded({ key, status: "error", data: null, error: describe(error) }); },
    );
    return () => { active = false; };
  }, [key, path]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (loaded === null || loaded.key !== key) {
    return { resource: { status: "loading", data: null, error: null }, reload };
  }
  if (loaded.status === "error") {
    return { resource: { status: "error", data: null, error: loaded.error ?? "Something went wrong." }, reload };
  }
  return { resource: { status: "ready", data: loaded.data as T, error: null }, reload };
}
