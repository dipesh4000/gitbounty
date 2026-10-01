# GitBounty web

The original `index.html`, `styles.css`, and `script.js` landing page, ported to Next.js without changing its design.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The issue board and GitHub sign-in call the FastAPI service at
`http://localhost:8001` by default.

To override the API URL in PowerShell:

```powershell
$env:NEXT_PUBLIC_GITBOUNTY_API = "http://localhost:8000"
npm run dev
```

On macOS or Linux:

```bash
NEXT_PUBLIC_GITBOUNTY_API=http://localhost:8000 npm run dev
```

## Checks

```bash
npm run lint
npm run build
```

The App Router entrypoint is `app/page.tsx`, the source stylesheet is preserved in `app/globals.css`, and the API behavior lives in `app/lib/api.ts` plus the client components under `app/components/`.
