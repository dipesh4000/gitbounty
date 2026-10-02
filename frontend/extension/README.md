# GitBounty Chrome extension

An optional companion to the GitBounty website. It puts a published bounty's point value and category
beside the matching issue on GitHub, and shows your own points in a toolbar popup. **The website works
completely without it** — nothing here is required to use GitBounty.

**Status:** working locally, loaded unpacked. Not published to any extension store.

## What a browser extension is made of

A website is one app that you host. An extension is code that runs inside somebody else's page
(github.com), so it is split into parts that cannot see each other directly:

- **`manifest.json`** — the declaration: name, version, which permissions it asks for, and which pages
  it is allowed to run on. The browser reads this first and nothing else happens without it.
- **A content script** (`src/content.js`, `src/points.js`) — JavaScript injected into a GitHub page. It
  can read and change that page's DOM, but it is on github.com's origin, so it *cannot* call
  `localhost:8001` itself.
- **A service worker** (`src/background.js`) — a background script with no page. It has the extension's
  own permissions, so it is the part that talks to the GitBounty API. The content script asks it for
  data by message passing. ("Service worker" here just means a script the browser starts when it is
  needed and stops when it is not; it has no DOM.)
- **A popup** (`popup/`) — a small HTML page shown when you click the toolbar icon. It is a normal page
  with its own document, and it talks to the API directly.
- **`src/config.js`** — the two URLs everything else reads, shared by the worker and the popup.

## What it shows, and what it refuses to show

| On | Shows |
|---|---|
| An issue list | `40 GitBounty · Frontend` beside an issue with a **published** bounty |
| An issue page | The same badge for that issue |
| A pull request that says `Closes #N` | The bounty on `#N`, and that its points go **to the pull request's author when it is merged** |

Three rules it does not break:

1. **The points go to the pull request's author**, not to whoever clicks Merge. The backend awards on
   `author:<login>`.
2. **Nothing is shown for untracked work.** No published bounty means no banner and no badge — never a
   baseline guess.
3. **A `gitbounty:40` GitHub label is a documented fallback, not an award.** Anyone with write access to
   a repository can add one and GitBounty has never seen it, so a label-only badge reads `40 label`, is
   styled differently, and says so in its accessible name. A published bounty from the API always
   replaces a label badge for the same issue; the reverse is refused.

## Install it for local development (Chrome, Brave, Edge)

1. Start the backend: see [`../../backend/README.md`](../../backend/README.md). It must answer on
   `http://localhost:8001`.
2. Start the website if you want the "Open full dashboard" link to work:
   `cd ../web && npm run dev` (serves `http://localhost:3000`).
3. Open `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and choose this folder (`frontend/extension`).
6. Open a GitHub issue list for a repository that has a published GitBounty bounty.

To pick up a change: click the reload arrow on the extension's card, then reload the GitHub tab.

## Test it by hand

The automated tests cover the logic and the DOM injection; these are the things only a real browser
shows.

1. **A published bounty badges.** Publish a bounty on the website for one of your own public
   repositories, then open that repository's issue list on GitHub. The badge appears beside the issue
   title, reading `<points> GitBounty · <Category>`.
2. **An untracked issue does not.** Another open issue in the same repository gets no badge.
3. **Client-side navigation.** Click from the issue list into an issue and back using GitHub's own
   links (no full reload). The badge is still there, exactly once — not twice.
4. **The pull-request banner.** Open a pull request whose body says `Closes #N` for that bounty. The
   banner names the author as the recipient. On a pull request closing an unpublished issue, there is no
   banner.
5. **The popup, signed out.** With no GitBounty session, click the toolbar icon: it offers **Connect
   GitHub** and shows no points. Clicking it opens the real OAuth flow at
   `http://localhost:8001/auth/github`.
6. **The popup, signed in.** After signing in, the popup shows your real login and week's points, and —
   on a tracked issue page — that issue's published value.
7. **The popup, API down.** Stop the backend and reopen the popup: it says GitBounty is not running on
   `localhost:8001` rather than showing a number.

## Permissions, and why each one

- `activeTab` — to ask the content script in the tab you are looking at what is on the page. It grants
  nothing until you click the toolbar icon.
- `http://localhost:8001/*` — the GitBounty API. The only host the extension may call.
- Content scripts are limited by `include_globs` to GitHub issue and pull-request URLs.

There is no remotely loaded code, no analytics, and no secret of any kind in this folder — everything
here ships to the browser and is therefore public (`../../rules.md` section 5).

## Run the checks

```bash
npm run check      # syntax check every file, then the tests
npm test           # the tests alone
```

`jsdom` is the only dependency, and only for tests: the DOM-injection tests load `src/content.js` into a
fixture document shaped like a GitHub page.
