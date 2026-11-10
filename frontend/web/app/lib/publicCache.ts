// Only public bounty listings belong here. Identity, points, claims and payments never do.
const KEY = "gitbounty:public-issues:v1";
const TTL = 30_000;
const LIMIT = 30;
type Entry = { expires: number; data: unknown };
let generation = 0;

// High-performance L1 in-memory cache to avoid repeated JSON serialization/deserialization
const memoryCache = new Map<string, Entry>();

function loadFromStorage(): Record<string, Entry> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, entry]) =>
          entry &&
          typeof entry === "object" &&
          typeof (entry as Entry).expires === "number" &&
          "data" in entry,
      ),
    ) as Record<string, Entry>;
  } catch {
    return {};
  }
}

export function publicCacheGeneration() {
  return generation;
}

export function readPublicCache(key: string): Entry | undefined {
  const now = Date.now();
  try {
    if (typeof window !== "undefined" && window.sessionStorage && !sessionStorage.getItem(KEY)) {
      memoryCache.clear();
    }
  } catch {
    /* Ignore storage access errors */
  }

  // 1. Check L1 Memory cache first (0ms latency, zero GC pressure)
  const inMemory = memoryCache.get(key);
  if (inMemory) {
    if (inMemory.expires > now) {
      return inMemory;
    }
    memoryCache.delete(key);
  }

  // 2. Check L2 SessionStorage if not in memory
  const stored = loadFromStorage()[key];
  if (stored && stored.expires > now) {
    memoryCache.set(key, stored);
    return stored;
  }
  return undefined;
}

export function writePublicCache(key: string, data: unknown, started: number) {
  if (started !== generation) return; // A write invalidated this in-flight read.
  const entry: Entry = { expires: Date.now() + TTL, data };
  memoryCache.set(key, entry);

  try {
    const current = loadFromStorage();
    const now = Date.now();
    const fresh = Object.entries(current).filter(([name, e]) => name !== key && e.expires > now);
    const updated = Object.fromEntries([...fresh.slice(-(LIMIT - 1)), [key, entry]]);
    sessionStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    /* Storage denied/full: in-memory cache still works. */
  }
}

export function clearPublicCache() {
  generation += 1;
  memoryCache.clear();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Storage is optional. */
  }
}
