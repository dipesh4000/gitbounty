# GitBounty web

The original `index.html`, `styles.css`, and `script.js` landing page, ported to Next.js without changing its design.

## Run locally

```bash
npm run dev
```

The issue board and GitHub sign-in call the FastAPI service at `http://localhost:8001` by default. Override that URL when necessary:

```bash
NEXT_PUBLIC_GITBOUNTY_API=http://localhost:8000 npm run dev
```

## Checks

```bash
npm run lint
npm run build
```

The App Router entrypoint is `app/page.tsx`, the source stylesheet is preserved in `app/globals.css`, and the API behavior lives in `app/lib/api.ts` plus the client components under `app/components/`.
