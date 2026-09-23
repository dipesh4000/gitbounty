/* Sample bounty data, carried over from the static site unchanged.
   This is still made-up data: the real board comes from the backend later. */

export type Bounty = {
  id: number;
  repo: string;
  title: string;
  amount: number;
  currency: string;
  label: string;
  age: string;
};

export const BOUNTIES: Bounty[] = [
  { id: 1, repo: "awslabs/cli-agent-orchestrator", title: "Threat model for agent manipulation (prompt injection) in a shared deployment", amount: 100, currency: "USDC", label: "enhancement", age: "1d ago" },
  { id: 2, repo: "awslabs/cli-agent-orchestrator", title: "Tenant-scoped audit trail for security-relevant events", amount: 55, currency: "USDC", label: "enhancement", age: "1d ago" },
  { id: 3, repo: "vercel/next.js", title: "App router: RSC hydration mismatch on nested layouts", amount: 250, currency: "USDC", label: "bug", age: "3d ago" },
  { id: 4, repo: "facebook/react", title: "Document useId hook edge cases in concurrent mode", amount: 75, currency: "USDC", label: "docs", age: "5d ago" },
  { id: 5, repo: "microsoft/TypeScript", title: "Type narrowing breaks with generic constraints in union types", amount: 400, currency: "USDC", label: "bug", age: "2d ago" },
  { id: 6, repo: "open-telemetry/opentelemetry-js", title: "Add OTLP/gRPC exporter streaming support", amount: 180, currency: "USDC", label: "enhancement", age: "6d ago" },
  { id: 7, repo: "supabase/supabase", title: "Write migration guide for RLS with multi-tenant schemas", amount: 60, currency: "USDC", label: "docs", age: "4d ago" },
  { id: 8, repo: "prettier/prettier", title: "Support formatting MDX 3 expression blocks", amount: 120, currency: "USDC", label: "enhancement", age: "2d ago" },
  { id: 9, repo: "vitejs/vite", title: "Fix SASS preprocessor crashing on circular imports in monorepo", amount: 90, currency: "USDC", label: "bug", age: "8h ago" },
  { id: 10, repo: "prisma/prisma", title: "Add first-class support for Postgres array columns in client", amount: 300, currency: "USDC", label: "enhancement", age: "1d ago" },
  { id: 11, repo: "tiangolo/fastapi", title: "Correct middleware ordering docs for ASGI lifespan events", amount: 45, currency: "USDC", label: "docs", age: "3d ago" },
  { id: 12, repo: "astro-build/astro", title: "Content collection schema validation throws unhelpful errors", amount: 150, currency: "USDC", label: "good-first-issue", age: "2d ago" },
];

const LABEL_NAMES: Record<string, string> = {
  enhancement: "enhancement",
  bug: "bug",
  docs: "docs",
  "good-first-issue": "good first issue",
};

export function labelDisplay(label: string): string {
  return LABEL_NAMES[label] ?? label;
}
