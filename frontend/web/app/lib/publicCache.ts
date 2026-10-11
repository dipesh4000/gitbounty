// Only public bounty listings belong here. Identity, points, claims and payments never do.
const KEY = "gitbounty:public-issues:v1";
const TTL = 30_000;
const LIMIT = 30;
type Entry = { expires: number; data: unknown };
let generation = 0;

function entries(): Record<string, Entry> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) =>
      entry && typeof entry === "object" && typeof entry.expires === "number" && "data" in entry));
  } catch {
    return {};
  }
}

export function publicCacheGeneration() { return generation; }

export function readPublicCache(key: string): Entry | undefined {
  const entry = entries()[key];
  return entry && entry.expires > Date.now() ? entry : undefined;
}

export function writePublicCache(key: string, data: unknown, started: number) {
  if (started !== generation) return; // A write invalidated this in-flight read.
  try {
    const fresh = Object.entries(entries()).filter(([name, entry]) => name !== key && entry.expires > Date.now());
    sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries([
      ...fresh.slice(-(LIMIT - 1)), [key, { expires: Date.now() + TTL, data }],
    ])));
  } catch { /* Storage denied/full: the API still works. */ }
}

export function clearPublicCache() {
  generation += 1;
  try { sessionStorage.removeItem(KEY); } catch { /* Storage is optional. */ }
}
