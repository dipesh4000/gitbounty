import { vi } from "vitest";

/** The API base the client is built against in tests. */
export const API = "http://localhost:8001";

type Route = { status?: number; body?: unknown };

/**
 * Stub `fetch` with a map of path prefix -> response.
 *
 * Matching is by prefix on the path after the API base, so a caller can stub `/api/issues` without
 * reproducing the query string the component builds. An unmatched request rejects loudly rather than
 * returning an empty object, so a test cannot pass because a component silently got `undefined`.
 */
export function stubApi(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const path = url.startsWith(API) ? url.slice(API.length) : url;

    const key = Object.keys(routes)
      .filter((candidate) => path.startsWith(candidate))
      .sort((a, b) => b.length - a.length)[0];

    if (!key) throw new Error(`no stub for ${path}`);
    const { status = 200, body = {} } = routes[key];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** A fetch that never settles, for asserting a loading state. */
export function stubPendingApi() {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
}

/** Replace window.location so a component's navigation can be asserted without leaving the page. */
export function captureNavigation() {
  const assigned: string[] = [];
  const replaced: string[] = [];
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...original,
      href: "http://localhost:3000/",
      assign: (url: string) => assigned.push(url),
      replace: (url: string) => replaced.push(url),
    },
  });
  return { assigned, replaced };
}
