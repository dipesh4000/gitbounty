# GitBounty

GitBounty is a static front-end prototype for an open-source bounty platform. Maintainers can fund GitHub issues, contributors can browse available work, and completed pull requests can eventually trigger payment from escrow.

The current project focuses on the product experience and uses sample bounty data in the browser. It does not yet include a backend, GitHub OAuth flow, live GitHub data, wallet integration, or a deployed escrow contract.

## Features

- Responsive GitBounty landing page
- Open bounty board with sample GitHub issues
- Search bounties by repository or title
- Filter by enhancement, bug, documentation, or good first issue
- Sort by bounty amount or newest listing
- Six selectable color themes with the selected theme saved in `localStorage`
- Mobile navigation menu
- Scroll reveal animations with reduced-motion support
- Links to the relevant GitHub issue pages

## Tech Stack

- HTML5
- CSS3 with custom properties and responsive layouts
- Vanilla JavaScript
- Google Fonts: Space Grotesk, Inter, and JetBrains Mono
- Local SVG and PNG assets in `assets/`

## Getting Started

No package installation or build step is required.

### Open directly

Open `index.html` in a modern browser.

### Run a local server

Using Python:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

Using Node.js, any static server can be used, for example:

```bash
npx serve .
```

## Project Structure

```text
.
├── index.html       # Page structure and product content
├── script.js        # Sample data and interactive behavior
├── styles.css       # Layout, themes, responsive styles, and animations
├── assets/          # Logo and favicon assets
└── readme.md        # Project documentation
```

## Customizing Bounties

Sample listings are stored in the `BOUNTIES` array near the top of `script.js`. Each bounty includes:

```js
{
	id: 1,
	repo: "owner/repository",
	title: "Issue title",
	amount: 100,
	currency: "USDC",
	label: "bug",
	age: "1d ago"
}
```

Replace this array with API data when connecting the page to a real service.

## Integration Points

The following parts are intentionally placeholders in this prototype:

- `initCTAButtons()` in `script.js` currently points GitHub connection buttons to `#`.
- Bounty listings are hard-coded sample data rather than fetched from GitHub.
- The payment, wallet, webhook, escrow, and authentication flows described in the page require a backend implementation.
- Footer links for About, Docs, GitHub, the browser extension, Terms, and Privacy are placeholder links.

## License

No license has been specified yet.