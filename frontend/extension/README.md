# Chrome extension

An optional add-on that shows GitBounty bounty badges directly on GitHub issue lists and issue pages. The website
must keep working without it.

**Status: not started.**

## Why it's more than "just a front end"

A website is one app that you host. An extension is code that runs inside someone else's page (github.com), so it
brings its own problems:

- **It's built from several parts**, not one page:
  - `manifest.json` declares the name, the permissions and which pages the extension runs on.
  - A **content script** is JS injected into github.com pages. It finds each issue in the list and adds the badge.
  - A **service worker** runs in the background. It asks the GitBounty backend for bounty amounts and caches them.
    The content script hands it the request, because a content script is held to the page's cross-origin rules.
  - A **popup** (optional) is the small window behind the toolbar icon, for sign-in and status.
- **GitHub is a moving target.** We depend on GitHub's HTML, which can change, and GitHub swaps pages without a full
  reload, so the content script has to notice navigation and re-add badges.
- **Separate build and release.** It's packaged as a zip, loaded through `chrome://extensions` while developing, and
  published through the Chrome Web Store, which reviews permissions and needs a privacy policy.
- **Everything in it is public.** It can't hold secrets, so all sensitive work stays in the backend.
- **Sign-in is different.** It can't just reuse the website's session.

## Suggested first version

Read-only. It needs no sign-in, because bounties on public issues are public data:

1. Content script finds the issue links on a GitHub issue list.
2. It asks the service worker for the bounties of those issues.
3. The service worker calls a public backend endpoint and returns the amounts.
4. The content script draws a badge next to each issue that has a bounty.

Sign-in, funding a bounty from inside GitHub and the popup can come later.

## Rules that apply here

See [`rules.md`](../../rules.md) section 5: the fewest permissions possible (`github.com` and the backend origin),
no remotely loaded code, no secrets in the bundle.
