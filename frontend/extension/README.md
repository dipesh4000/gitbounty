# Chrome extension

An optional add-on that shows GitBounty point badges directly on GitHub issue lists and issue pages. The website
must keep working without it.

**Status: working local extension with a toolbar popup, issue badges, and pull-request award previews.**

## Why it's more than "just a front end"

A website is one app that you host. An extension is code that runs inside someone else's page (github.com), so it
brings its own problems:

- **It's built from several parts**, not one page:
  - `manifest.json` declares the name, the permissions and which pages the extension runs on.
  - A **content script** is JS injected into github.com pages. It finds each issue in the list and adds the badge.
  - A **service worker** can run in the background. A later slice will use one to ask the GitBounty backend for
    stored point overrides and cache them.
    The content script hands it the request, because a content script is held to the page's cross-origin rules.
  - The **popup** is the small window behind the toolbar icon. It shows GitHub connection state, total points,
    recent counted merges, and the active issue's value when the page carries a `gitbounty:N` label.
- **GitHub is a moving target.** We depend on GitHub's HTML, which can change, and GitHub swaps pages without a full
  reload, so the content script has to notice navigation and re-add badges.
- **Separate build and release.** It's packaged as a zip, loaded through `chrome://extensions` while developing, and
  published through the Chrome Web Store, which reviews permissions and needs a privacy policy.
- **Everything in it is public.** It can't hold secrets, so all sensitive work stays in the backend.
- **Sign-in is different.** It can't just reuse the website's session.

## Current version

Dependency-free and read-only on GitHub. It never changes issues or pull requests:

1. The content script runs only on GitHub issue-list and issue-detail URLs.
2. It recognises the shared `gitbounty:<points>` label format and draws the Graphite Lime points badge beside it.
   Categorized issues without a value show the 5-point merge baseline; uncategorized rows say `not tracked`.
3. On a pull request whose description closes an issue, it previews the merge award (issue points plus the 5-point
   baseline) directly below the pull-request header.
4. The toolbar popup mirrors the supplied signed-out, default, and tracked-issue UI states using real backend data.
5. A mutation observer restores GitBounty UI after GitHub's client-side navigation and live updates.

The popup currently connects to `http://localhost:8001`. Its signed-in states require the backend OAuth and database
environment values. While those credentials are pending, **Connect GitHub** creates a browser-local demo session as
`@aasha-malik`; it does not call GitHub and can be signed out from the popup menu. Remove the demo-session branch when
the real OAuth configuration is ready.

## Run it locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `frontend/extension` folder.
4. Open a GitHub issue with a label such as `gitbounty:40`, then click the GitBounty toolbar icon.
5. After editing the extension, click its reload button on the extensions page before testing again.

Run `npm test` in this folder for the label/path contract tests. No install step is required.

## Rules that apply here

See [`rules.md`](../../rules.md) section 5: the fewest permissions possible (`github.com` and the backend origin),
no remotely loaded code, no secrets in the bundle.
