import { afterEach, expect, it, vi } from "vitest";
import { api } from "../app/lib/api";
import { clearPublicCache } from "../app/lib/publicCache";
import { stubApi } from "./helpers";

afterEach(() => { clearPublicCache(); vi.useRealTimers(); });

it("reuses public listings across reads, expires them, and bypasses on refresh", async () => {
  vi.useFakeTimers();
  const { fetchMock } = stubApi({ "/api/issues": { body: { items: [] } } });
  await api("/api/issues?page=1");
  await api("/api/issues?page=1");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await api("/api/issues?page=2");
  await api("/api/issues?page=1", { cache: "no-store" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(30_001);
  await api("/api/issues?page=1");
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("never caches private reads or failures and invalidates after writes", async () => {
  const { fetchMock } = stubApi({
    "/api/issues": { body: { items: [] } }, "/api/me": { body: { id: 1 } },
    "/api/maintainer/bounties": { body: {} }, "/api/issues?q=bad": { status: 503 },
  });
  await api("/api/me"); await api("/api/me");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await expect(api("/api/issues?q=bad")).rejects.toThrow();
  await expect(api("/api/issues?q=bad")).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await api("/api/issues");
  await api("/api/maintainer/bounties", { method: "POST" });
  await api("/api/issues");
  expect(fetchMock).toHaveBeenCalledTimes(7);
});

it("does not repopulate the cache with a read started before a write", async () => {
  let resolve!: (response: Response) => void;
  const { fetchMock } = stubApi({ "/api/issues": { body: {} }, "/write": { body: {} } });
  fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
  const old = api("/api/issues");
  await api("/write", { method: "POST" });
  resolve({ ok: true, status: 200, json: async () => ({ old: true }) } as Response);
  await old;
  await api("/api/issues");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("works with denied storage and bounds the number of cached filters", async () => {
  const { fetchMock } = stubApi({ "/api/issues": { body: {} } });
  for (let n = 0; n < 35; n++) await api(`/api/issues?page=${n}`);
  const stored = JSON.parse(sessionStorage.getItem("gitbounty:public-issues:v1")!);
  expect(Object.keys(stored)).toHaveLength(30);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
  await expect(api("/api/issues?q=new")).resolves.toEqual({});
  expect(fetchMock).toHaveBeenCalledTimes(36);
});
