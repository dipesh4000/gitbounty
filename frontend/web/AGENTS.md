# Website agent notes

Read the root [overview](../../overview.md), [agent guide](../../agent.md) and [rules](../../rules.md).
This project uses React/TypeScript and the standard Next.js App Router.

Use existing CSS tokens, API helpers and accessible controls.
Run checks from this folder. For toolchain changes, verify the production server as well as the build.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
