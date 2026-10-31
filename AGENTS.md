# AGENTS.md

WeChat mini-game (微信小游戏) online chess, with a separate browser-based online client. The mini-game client is ES5 Canvas code run inside WeChat DevTools; the browser client is `index.html`; both use a small Node `ws` server. Read `DEVLOG.md` for project history and known gaps — `README.md` describes an old airplane-shooter template and is stale (its `js/base`, `js/npc`, `audio/` trees no longer exist).

## Commands

- Server: `cd server; node server.js` (uses `process.env.PORT`, defaults to **43879**; mini-game client URL in `js/socket.js:5` remains `ws://localhost:43879`).
- Integration test: with server running, `node server/test.js` (two fake clients play e2-e4 / e7-e5; 10s timeout, exit code 0 on success).
- Browser client: open `index.html`; it connects to the deployed Render WebSocket service. GitHub Pages serves it at `https://lhw-gif.github.io/chess-game/`.
- No build, lint, typecheck, or package scripts exist. `.eslintrc.js` has empty rules; eslint is optional and not part of any workflow.
- The Render WebSocket endpoint is `wss://chess-online-server-popz.onrender.com`; the free service may sleep while idle and room state is in memory only.

## Constraints agents must not break

- **ES5 only**: `project.config.json` sets `es6: false`, `enhance: false`, `disableUseStrict: true`. Write `var`, `Function.prototype`, CommonJS `require`/`module.exports`. No arrow functions, `let`/`const`, classes, template literals, or `Object.assign` on the client (server may use `Object.assign` — it runs plain Node).
- Canvas must come from `wx.createCanvas()`; there is no global `canvas`. Touch coords map 1:1 to canvas coords (`wx.onTouchStart`, `t.clientX/Y`).
- Chinese UI strings are written as `\uXXXX` escapes in source; keep that style.

## Architecture

- Entry: `game.js` → `js/main.js` (menu, game loop, socket handlers). Supporting modules: `js/board.js` (client-side rules for move highlighting), `js/renderer.js`, `js/socket.js`.
- `server/server.js` is authoritative for game rules: move validation, check/checkmate/stalemate, room management, disconnect handling. The client's `js/board.js` duplicates basic move logic only for legal-move hints — if you change rules, update both or the highlight layer will diverge from server truth.
- `index.html` is a separate browser client with its own local legal-move hints; the server remains authoritative for submitted moves. Keep its duplicated hint rules aligned with `server/server.js` when rules change.
- Protocol is JSON messages over WebSocket (`create_room`, `join_room`, `move`, `resign`, `leave_room`; server replies `room_created`, `game_start`, `move_made`, `error`, `opponent_left`). Board is an 8×8 array of `{type, color}` or null; white starts at rows 6–7.
- Mini-game multiplayer flow: create room → share card with `?room=ID` → friend auto-joins via `wx.getLaunchOptionsSync()` query.
- Browser multiplayer flow: create room → share generated URL with `?room=ID` → friend auto-joins in `index.html`.

## Known gaps (do not assume present)

- Castling and en passant are not implemented (server or client).
- Pawn promotion defaults to queen on the server; the mini-game client has a promotion picker UI but DEVLOG lists it as incomplete/inconsistent.
- No reconnection: disconnect mid-game ends the game and awards the win.
- `images/` and any leftover template assets are unused by the chess game.

## Layout

- `js/` — mini-game client (only `main.js`, `board.js`, `renderer.js`, `socket.js` are live code).
- `server/` — Node backend + `test.js`; only dependency is `ws`.
- `index.html` — browser multiplayer client, separate from the mini-game client.
- No CI, no git hooks, no workspace/monorepo tooling.
