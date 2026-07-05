# Ghost4Ghost — Project Memory

Live 1v1 vape trick duel platform for legal-age adults. Two players, cameras on,
countdown, alternating trick turns, honor verdict, rematch. "Trick for trick.
Cloud for cloud." Built with Soreeyou (learning web dev via The Odin Project,
often working from mobile).

## Live deployments
- Site: https://ghost4ghost.netlify.app (Netlify — currently deployed by dropping `index.html`)
- Signaling server: wss://ghost4ghost-signal.onrender.com (Render free tier, repo `ghost4ghost-signal`)
- Server health check: https://ghost4ghost-signal.onrender.com returns `{"ok":true,...}`

## Repo map
- `index.html` — the ENTIRE client, single file on purpose (engine + "Cloud Arcade" skin, ~2100 lines). Do not split it into modules unless explicitly asked.
- `server/` — Node WebSocket signaling server (matchmaking, rooms, WebRTC relay, verdicts). Deployed separately to Render from its own repo; keep this copy in sync.
- `tests/` — three jsdom suites (see Commands).
- `docs/HISTORY.md` — full project history and protocol reference. Read it before large changes.
- `docs/skins/` — the two previous visual skins (classic esports, spectral) for reference/revert.

## Commands
- `npm test` — server protocol suite (28 checks) + two-browser integration (27 checks) + offline escape hatch. Run before EVERY deliverable.
- `npm run test:sim` — full offline-demo regression (slow, ~2–4 min; auto-blanks the server URL).
- `npm run test:integration` — two real jsdom browsers duel through a locally spawned server on :8117.
- `npm run server` — run the signaling server locally (PORT env, default 8090).

## Architecture in brief
- Client connects to `SIGNAL_URL_DEFAULT` (search `CONFIGURE ME` in index.html); `?ws=wss://...` query overrides it for testing.
- Server pairs players (global FIFO queue or GHST-XXXX friend codes), relays WebRTC SDP/ICE, syncs ready checks / firstTurn / turn_done / verdicts / rematch. Video is P2P (STUN + public TURN relay) — it never touches the server.
- No spectators yet, so duels end in an **honor verdict**: both players vote the winner; agree → GR moves, split → draw. Room voting is Phase 4.
- If the server is unreachable, the client falls back to the offline sim demo (all sim functions are suffixed `*Sim`) and offers a "Use offline demo" escape hatch in the queue.
- Render free tier sleeps after ~15 idle min; the client pre-warms on page load and shows "Waking server…" (~30s worst case). This is expected, not a bug.

## Invariants — YOU MUST respect these
- NEVER rename or remove element IDs. All three test suites drive the DOM by ID.
- NEVER change user-visible JS strings casually — tests assert several (e.g. "Searching the queue", "You take the room"). If a string must change, update tests in the same commit and run `npm test`.
- Keep offline sim behavior identical when touching net code. Sim and net drivers are deliberately separate.
- Color semantics: `--red` means DANGER ONLY (Report / End / Forfeit). Alive/online/your-turn = mint. Wins/GO = mango. Grape = accent.
- Safety UI (Report + End Duel) stays visible in every duel state. The age gate stays. Never soften either.
- Motion: transforms/opacity only, honor `prefers-reduced-motion`, custom cursor stays gated to `(pointer:fine)`.
- Server sanitizes tags to `[a-zA-Z0-9._-]` max 18 chars — keep client-side `cleanTag` in sync.

## Design system — "Cloud Arcade"
Dark base `#12131A`; flavors: grape `#A78BFA`, mint `#4EE6C1`, mango `#FFB35C`; danger `#FF4155`.
Fonts: Bricolage Grotesque 800 (display) / Space Grotesk (body) / JetBrains Mono (codes, timers, STATE).
Signature moves: buttons puff a vapor O-ring on press (`:active::after`, works on touch); smoke-ring cursor on desktop; spring easing `cubic-bezier(.34,1.56,.64,1)`; mint "mod-LED" ring on the active feed. Skin lives in `<style id="arcadeSkin">`; base layout in the first `<style>`.

## Deploy
- Site: drag `index.html` (or a zip of it) onto Netlify — OR connect this repo to Netlify for push-to-deploy (preferred; publish directory = repo root).
- Server: push `server/server.js` + `server/package.json` to the `ghost4ghost-signal` GitHub repo → Render auto-deploys. Build `npm install`, start `node server.js`.

## Known caveats / debt
- TURN uses the public openrelay.metered.ca credentials — swap for owned Metered/Cloudflare creds before scale (in `ICE_SERVERS`, index.html).
- Reports only log to the Render console; no moderation storage yet.
- Age gate is self-attestation only; real age verification is open work.
- Ratings (GR) are client-local; server-side persistence is Phase 4.

## Roadmap
- Phase 4: spectator rooms + real room voting, server-side ratings/persistence, moderation queue + server-enforced blocks, real age verification.
- Phase 5: ranked seasons, placements, leaderboards backed by the server.

## Working with Soreeyou
- Often on mobile; keep explanations concise, ship working artifacts.
- Test-before-ship is the house rule: run `npm test` before presenting anything.
- Prefers building over discussing; propose, then do.

## Agent gotchas (hard-won)
- jsdom has no RTCPeerConnection / mediaDevices / IntersectionObserver — the client guards all three; don't "fix" the guards.
- Integration test spawns the real server as a child process on :8117 — no shell backgrounding needed.
- Never `pkill -f` with a pattern that appears in your own command line (it kills your own shell).
- Deep background, protocol message tables, and the full build history: read `docs/HISTORY.md`.
