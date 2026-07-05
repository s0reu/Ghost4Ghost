# Ghost4Ghost

Live 1v1 vape trick duels for legal-age adults. Two cameras, one countdown, honor verdict.

- **Live site:** https://ghost4ghost.netlify.app
- **Signaling server:** https://ghost4ghost-signal.onrender.com (separate repo: `ghost4ghost-signal`)

## Setup
```bash
npm install
npm test          # protocol (28) + 2-browser integration (27) + fallback checks
npm run test:sim  # full offline-demo regression (slower)
```

## Deploy
- **Site:** connect this repo to Netlify (publish directory: repo root) for push-to-deploy — or drag `index.html` onto app.netlify.com/drop.
- **Server:** push `server/server.js` + `server/package.json` to the `ghost4ghost-signal` repo; Render auto-deploys (build `npm install`, start `node server.js`).

## Working with Claude Code
This repo carries its own memory: **`CLAUDE.md`** is loaded automatically at the
start of every Claude Code session (project context, invariants, commands), and
`docs/HISTORY.md` holds the deep background. Claude Code's auto-memory will keep
accumulating new learnings on top ([docs](https://code.claude.com/docs/en/memory)).

Quickstart on a computer (see https://docs.claude.com/en/docs/claude-code/overview
for current install instructions):
```bash
cd ghost4ghost
claude
```
First prompt suggestion: “Read CLAUDE.md and docs/HISTORY.md, then run npm test to confirm the baseline.”
