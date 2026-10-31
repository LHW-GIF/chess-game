# AGENTS.md

WeChat mini-game (微信小游戏) online chess. Client is ES5 Canvas code run inside WeChat DevTools; backend is a small Node `ws` server. Read `DEVLOG.md` for project history and known gaps — `README.md` describes an old airplane-shooter template and is stale (its `js/base`, `js/npc`, `audio/` trees no longer exist).

## Commands

- Server: `cd server; node server.js` (port **43879**, hardcoded in both `server/server.js` and `js/socket.js:5`).
- Integration test: with server running, `node server/test.js` (two fake clients play e2-e4 / e7-e5; 10s timeout, exit code 0 on success).
- Browser mock: open `test.html` — standalone local board with its own duplicated rules; not wired to the mini-game code or server.
- No build, lint, typecheck, or package scripts exist. `.eslintrc.js` has empty rules; eslint is optional and not part of any workflow.
- Real-device testing requires changing `js/socket.js` URL from `localhost` (and `urlCheck: false` is already set).

## Constraints agents must not break

- **ES5 only**: `project.config.json` sets `es6: false`, `enhance: false`, `disableUseStrict: true`. Write `var`, `Function.prototype`, CommonJS `require`/`module.exports`. No arrow functions, `let`/`const`, classes, template literals, or `Object.assign` on the client (server may use `Object.assign` — it runs plain Node).
- Canvas must come from `wx.createCanvas()`; there is no global `canvas`. Touch coords map 1:1 to canvas coords (`wx.onTouchStart`, `t.clientX/Y`).
- Chinese UI strings are written as `\uXXXX` escapes in source; keep that style.

## Architecture

- Entry: `game.js` → `js/main.js` (menu, game loop, socket handlers). Supporting modules: `js/board.js` (client-side rules for move highlighting), `js/renderer.js`, `js/socket.js`.
- `server/server.js` is authoritative for game rules: move validation, check/checkmate/stalemate, room management, disconnect handling. The client's `js/board.js` duplicates basic move logic only for legal-move hints — if you change rules, update both or the highlight layer will diverge from server truth.
- Protocol is JSON messages over WebSocket (`create_room`, `join_room`, `move`, `resign`, `leave_room`; server replies `room_created`, `game_start`, `move_made`, `error`, `opponent_left`). Board is an 8×8 array of `{type, color}` or null; white starts at rows 6–7.
- Multiplayer flow: create room → share card with `?room=ID` → friend auto-joins via `wx.getLaunchOptionsSync()` query.

## Known gaps (do not assume present)

- Castling and en passant are not implemented (server or client).
- Pawn promotion defaults to queen on the server; the mini-game client has a promotion picker UI but DEVLOG lists it as incomplete/inconsistent.
- No reconnection: disconnect mid-game ends the game and awards the win.
- `images/` and any leftover template assets are unused by the chess game.

## Layout

- `js/` — mini-game client (only `main.js`, `board.js`, `renderer.js`, `socket.js` are live code).
- `server/` — Node backend + `test.js`; only dependency is `ws`.
- `test.html` — browser mock, separate implementation.
- No CI, no git hooks, no workspace/monorepo tooling.
