# Chrome extension

An optional add-on that shows GitBounty point badges directly on GitHub issue lists and issue pages. The website
must keep working without it.

**Status: first read-only slice implemented.**

## Why it's more than "just a front end"

A website is one app that you host. An extension is code that runs inside someone else's page (github.com), so it
brings its own problems:

- **It's built from several parts**, not one page:
  - `manifest.json` declares the name, the permissions and which pages the extension runs on.
  - A **content script** is JS injected into github.com pages. It finds each issue in the list and adds the badge.
  - A **service worker** can run in the background. A later slice will use one to ask the GitBounty backend for
    stored point overrides and cache them.
    The content script hands it the request, because a content script is held to the page's cross-origin rules.
  - A **popup** (optional) is the small window behind the toolbar icon, for sign-in and status.
- **GitHub is a moving target.** We depend on GitHub's HTML, which can change, and GitHub swaps pages without a full
  reload, so the content script has to notice navigation and re-add badges.
- **Separate build and release.** It's packaged as a zip, loaded through `chrome://extensions` while developing, and
  published through the Chrome Web Store, which reviews permissions and needs a privacy policy.
- **Everything in it is public.** It can't hold secrets, so all sensitive work stays in the backend.
- **Sign-in is different.** It can't just reuse the website's session.

## Current first version

Read-only and dependency-free. It needs no sign-in because GitHub issue labels are public:

1. The content script runs only on GitHub issue-list and issue-detail URLs.
2. It recognises the shared `gitbounty:<points>` label format.
3. It draws a `GB +40 PTS` badge beside the label.
4. A mutation observer restores badges after GitHub's client-side navigation and live updates.

The next slice is a small public backend lookup plus a service worker, so a value set on the GitBounty website can
override a repository label. Sign-in and the toolbar popup can come later.

## Run it locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `frontend/extension` folder.
4. Open a GitHub issue with a label such as `gitbounty:40`.

Run `npm test` in this folder for the label/path contract tests. No install step is required.

## Rules that apply here

See [`rules.md`](../../rules.md) section 5: the fewest permissions possible (`github.com` and the backend origin),
no remotely loaded code, no secrets in the bundle.
