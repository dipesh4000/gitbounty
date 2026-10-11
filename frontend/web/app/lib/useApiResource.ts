"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Keep the request key with its result so changed filters immediately render as loading.
export type Resource<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

type Loaded<T> = { key: string } & Exclude<Resource<T>, { status: "loading" }>;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * Fetch `path` whenever it changes, or when the returned `reload` is called.
 *
 * `path` may be null to fetch nothing, which is how a view that depends on a choice the user has not made
 * yet stays idle rather than requesting something meaningless.
 */
export function useApiResource<T>(path: string | null, delay = 0): {
  resource: Resource<T>;
  reload: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const key = `${attempt}:${path ?? ""}`;

  useEffect(() => {
    if (path === null) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<T>(path, { signal: controller.signal, ...(attempt > 0 ? { cache: "no-store" as const } : {}) }).then(
        (data) => { if (active) setLoaded({ key, status: "ready", data, error: null }); },
        (error: unknown) => { if (active) setLoaded({ key, status: "error", data: null, error: describe(error) }); },
      );
    }, delay);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [key, path, delay, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (loaded === null || loaded.key !== key) {
    return { resource: { status: "loading", data: null, error: null }, reload };
  }
  return { resource: loaded, reload };
}
