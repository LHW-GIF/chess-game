var WebSocket = require('ws');
var http = require('http');
var PORT = process.env.PORT || 43879;

var server = http.createServer(function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Chess Server OK');
});

var wss = new WebSocket.Server({ server });
var rooms = {};
var players = {};

function genId() {
  var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var s = '';
  for (var i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function initBoard() {
  var b = [];
  var r, c;
  for (r = 0; r < 8; r++) { b[r] = []; for (c = 0; c < 8; c++) b[r][c] = null; }
  var back = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for (c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'black' };
    b[1][c] = { type: 'pawn', color: 'black' };
    b[6][c] = { type: 'pawn', color: 'white' };
    b[7][c] = { type: back[c], color: 'white' };
  }
  return b;
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendRoom(room, msg, skip) {
  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].ws !== skip) send(room.players[i].ws, msg);
  }
}

function get(board, r, c) {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return board[r][c];
}

function pathClear(board, fr, fc, tr, tc) {
  var sr = Math.sign(tr - fr);
  var sc = Math.sign(tc - fc);
  var r = fr + sr, c = fc + sc;
  while (r !== tr || c !== tc) {
    if (board[r][c]) return false;
    r += sr; c += sc;
  }
  return true;
}

function canMove(board, fr, fc, tr, tc) {
  var piece = board[fr][fc];
  if (!piece) return false;
  var target = board[tr][tc];
  if (target && target.color === piece.color) return false;
  var dr = tr - fr, dc = tc - fc;
  var ar = Math.abs(dr), ac = Math.abs(dc);
  var ok = false;

  if (piece.type === 'pawn') {
    var dir = piece.color === 'white' ? -1 : 1;
    var start = piece.color === 'white' ? 6 : 1;
    if (dc === 0) {
      if (dr === dir && !target) ok = true;
      if (dr === dir * 2 && fr === start && !target && !board[fr + dir][fc]) ok = true;
    } else if (ac === 1 && dr === dir) {
      if (target && target.color !== piece.color) ok = true;
    }
  } else if (piece.type === 'rook') {
    ok = (dr === 0 || dc === 0) && (ar + ac > 0);
    if (ok) ok = pathClear(board, fr, fc, tr, tc);
  } else if (piece.type === 'knight') {
    ok = (ar === 2 && ac === 1) || (ar === 1 && ac === 2);
  } else if (piece.type === 'bishop') {
    ok = ar === ac && ar > 0;
    if (ok) ok = pathClear(board, fr, fc, tr, tc);
  } else if (piece.type === 'queen') {
    ok = (dr === 0 || dc === 0 || ar === ac) && (ar + ac > 0);
    if (ok) ok = pathClear(board, fr, fc, tr, tc);
  } else if (piece.type === 'king') {
    ok = ar <= 1 && ac <= 1 && (ar + ac > 0);
  }
  return ok;
}

function findKing(board, color) {
  for (var r = 0; r < 8; r++)
    for (var c = 0; c < 8; c++) {
      var p = board[r][c];
      if (p && p.type === 'king' && p.color === color) return { r: r, c: c };
    }
  return null;
}

function attacked(board, r, c, by) {
  var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  var i, d, nr, nc, p;
  for (i = 0; i < dirs.length; i++) {
    d = dirs[i]; nr = r + d[0]; nc = c + d[1];
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      p = board[nr][nc];
      if (p) {
        if (p.color === by) {
          if (p.type === 'king' || p.type === 'queen') return true;
          if (p.type === 'bishop' && d[0] !== 0 && d[1] !== 0) return true;
          if (p.type === 'rook' && (d[0] === 0 || d[1] === 0)) return true;
        }
        break;
      }
      nr += d[0]; nc += d[1];
    }
  }
  var kn = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (i = 0; i < kn.length; i++) {
    nr = r + kn[i][0]; nc = c + kn[i][1];
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      p = board[nr][nc];
      if (p && p.color === by && p.type === 'knight') return true;
    }
  }
  var pd = by === 'white' ? 1 : -1;
  for (var dc = -1; dc <= 1; dc += 2) {
    nr = r + pd; nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      p = board[nr][nc];
      if (p && p.color === by && p.type === 'pawn') return true;
    }
  }
  return false;
}

function inCheck(board, color) {
  var k = findKing(board, color);
  if (!k) return false;
  return attacked(board, k.r, k.c, color === 'white' ? 'black' : 'white');
}

function simMove(board, fr, fc, tr, tc) {
  var nb = [];
  for (var r = 0; r < 8; r++) { nb[r] = []; for (var c = 0; c < 8; c++) nb[r][c] = board[r][c] ? { type: board[r][c].type, color: board[r][c].color } : null; }
  nb[tr][tc] = nb[fr][fc];
  nb[fr][fc] = null;
  return nb;
}

function hasLegal(board, color) {
  for (var fr = 0; fr < 8; fr++)
    for (var fc = 0; fc < 8; fc++) {
      var p = board[fr][fc];
      if (p && p.color === color) {
        for (var tr = 0; tr < 8; tr++)
          for (var tc = 0; tc < 8; tc++) {
            if (fr === tr && fc === tc) continue;
            if (!canMove(board, fr, fc, tr, tc)) continue;
            var nb = simMove(board, fr, fc, tr, tc);
            if (!inCheck(nb, color)) return true;
          }
      }
    }
  return false;
}

function validMove(board, fr, fc, tr, tc, color) {
  var piece = board[fr][fc];
  if (!piece || piece.color !== color) return false;
  if (!canMove(board, fr, fc, tr, tc)) return false;
  var nb = simMove(board, fr, fc, tr, tc);
  return !inCheck(nb, color);
}

function processMove(room, msg) {
  var board = room.board;
  var fr = msg.fr, fc = msg.fc, tr = msg.tr, tc = msg.tc;
  var piece = board[fr][fc];
  if (!piece || piece.color !== room.turn) return { ok: false, err: 'not your turn' };
  if (!validMove(board, fr, fc, tr, tc, piece.color)) return { ok: false, err: 'invalid move' };

  var captured = board[tr][tc];
  board[tr][tc] = piece;
  board[fr][fc] = null;

  if (piece.type === 'pawn') {
    var promoRow = piece.color === 'white' ? 0 : 7;
    if (tr === promoRow) {
      board[tr][tc] = { type: msg.promo || 'queen', color: piece.color };
    }
  }

  room.turn = room.turn === 'white' ? 'black' : 'white';
  var opp = room.turn;
  var check = inCheck(board, opp);
  var legal = hasLegal(board, opp);
  var gameOver = !legal;
  var result = gameOver ? (check ? 'checkmate' : 'stalemate') : null;

  var moveRec = { fr: fr, fc: fc, tr: tr, tc: tc, piece: piece, captured: captured, check: check };
  room.moves.push(moveRec);

  return {
    ok: true,
    board: room.board,
    currentTurn: room.turn,
    move: moveRec,
    inCheck: check,
    gameOver: gameOver,
    result: result,
    winner: gameOver ? piece.color : null
  };
}

wss.on('connection', function(ws) {
  var pid = Math.random().toString(36).substr(2, 9);
  players[pid] = { ws: ws, roomId: null, name: '' };
  send(ws, { type: 'connected', playerId: pid });

  ws.on('message', function(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    var pl = players[pid];
    if (!pl) return;

    if (msg.type === 'create_room') {
      pl.name = msg.name || 'P1';
      var rid;
      do { rid = genId(); } while (rooms[rid]);
      var room = { id: rid, players: [{ ws: ws, name: pl.name, color: 'white' }], board: null, turn: 'white', status: 'waiting', moves: [] };
      rooms[rid] = room;
      pl.roomId = rid;
      send(ws, { type: 'room_created', roomId: rid, color: 'white' });
      console.log('Room ' + rid + ' created by ' + pl.name);
    }

    else if (msg.type === 'join_room') {
      var rid2 = msg.roomId.toUpperCase();
      var room2 = rooms[rid2];
      if (!room2) { send(ws, { type: 'error', error: '\u623f\u95f4\u4e0d\u5b58\u5728' }); return; }
      if (room2.players.length >= 2) { send(ws, { type: 'error', error: '\u623f\u95f4\u5df2\u6ee1' }); return; }
      if (room2.status !== 'waiting') { send(ws, { type: 'error', error: '\u6e38\u620f\u5df2\u5f00\u59cb' }); return; }
      pl.name = msg.name || 'P2';
      pl.roomId = rid2;
      room2.players.push({ ws: ws, name: pl.name, color: 'black' });
      room2.board = initBoard();
      room2.status = 'playing';
      send(ws, { type: 'room_joined', roomId: rid2, color: 'black', board: room2.board });
      sendRoom(room2, { type: 'game_start', board: room2.board, currentTurn: 'white', players: room2.players.map(function(p) { return { name: p.name, color: p.color }; }) });
      console.log(pl.name + ' joined room ' + rid2);
    }

    else if (msg.type === 'move') {
      var room3 = rooms[pl.roomId];
      if (!room3 || room3.status !== 'playing') { send(ws, { type: 'error', error: 'no game' }); return; }
      var res = processMove(room3, msg);
      if (res.ok) {
        sendRoom(room3, Object.assign({ type: 'move_made' }, res));
      } else {
        send(ws, { type: 'error', error: res.err });
      }
    }

    else if (msg.type === 'resign') {
      var room4 = rooms[pl.roomId];
      if (room4 && room4.status === 'playing') {
        room4.status = 'finished';
        var winner = room4.players[0].ws !== ws ? room4.players[0] : room4.players[1];
        sendRoom(room4, { type: 'opponent_left', winner: winner.name });
      }
    }

    else if (msg.type === 'leave_room') {
      var room5 = rooms[pl.roomId];
      if (room5) {
        room5.players = room5.players.filter(function(p) { return p.ws !== ws; });
        if (room5.players.length === 0) delete rooms[pl.roomId];
        else { room5.status = 'finished'; sendRoom(room5, { type: 'opponent_left', winner: room5.players[0].name }); }
        pl.roomId = null;
      }
    }
  });

  ws.on('close', function() {
    var pl = players[pid];
    if (pl && pl.roomId) {
      var room = rooms[pl.roomId];
      if (room) {
        room.players = room.players.filter(function(p) { return p.ws !== ws; });
        if (room.players.length === 0) delete rooms[pl.roomId];
        else { room.status = 'finished'; sendRoom(room, { type: 'opponent_left', winner: room.players[0].name }); }
      }
    }
    delete players[pid];
    console.log('Player disconnected');
  });
});

server.listen(PORT, function() {
  console.log('Chess server running on port ' + PORT);
});
