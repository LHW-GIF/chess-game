var WebSocket = require('ws');
var http = require('http');
var PORT = process.env.PORT || 43879;

var server = http.createServer(function(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Chess Server OK');
});

var wss = new WebSocket.Server({ server: server, maxPayload: 16 * 1024 });
var rooms = {};
var players = {};
var reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS) || 30000;

function setReconnectGraceMs(ms) {
  if (typeof ms === 'number' && isFinite(ms) && ms >= 0) reconnectGraceMs = ms;
}

function genId() {
  var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var s = '';
  for (var i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function genToken() {
  return Math.random().toString(36).substr(2, 10) + Math.random().toString(36).substr(2, 10);
}

function initCastling() {
  return { wK: true, wQ: true, bK: true, bQ: true };
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
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendRoom(room, msg, skip) {
  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].ws && room.players[i].ws !== skip) send(room.players[i].ws, msg);
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

function canMove(board, fr, fc, tr, tc, state) {
  var piece = board[fr][fc];
  if (!piece) return false;
  var target = board[tr][tc];
  if (target && target.type === 'king') return false;
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
      else if (!target && state && state.enPassant && state.enPassant.r === tr && state.enPassant.c === tc) {
        var epPawn = board[fr][tc];
        if (epPawn && epPawn.type === 'pawn' && epPawn.color !== piece.color) ok = true;
      }
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
    if (!ok && dr === 0 && ac === 2 && !target && state && state.castling) {
      var homeRow = piece.color === 'white' ? 7 : 0;
      var opp = piece.color === 'white' ? 'black' : 'white';
      if (fr === homeRow && fc === 4 && tr === homeRow && !attacked(board, homeRow, 4, opp)) {
        if (tc === 6 && state.castling[piece.color === 'white' ? 'wK' : 'bK']) {
          var kRook = board[homeRow][7];
          if (kRook && kRook.type === 'rook' && kRook.color === piece.color &&
              !board[homeRow][5] && !board[homeRow][6] &&
              !attacked(board, homeRow, 5, opp) && !attacked(board, homeRow, 6, opp)) {
            ok = true;
          }
        } else if (tc === 2 && state.castling[piece.color === 'white' ? 'wQ' : 'bQ']) {
          var qRook = board[homeRow][0];
          if (qRook && qRook.type === 'rook' && qRook.color === piece.color &&
              !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
              !attacked(board, homeRow, 3, opp) && !attacked(board, homeRow, 2, opp)) {
            ok = true;
          }
        }
      }
    }
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
          var distance = Math.max(Math.abs(nr - r), Math.abs(nc - c));
          if (p.type === 'king' && distance === 1) return true;
          if (p.type === 'queen') return true;
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

function simMove(board, fr, fc, tr, tc, promotion) {
  var nb = [];
  for (var r = 0; r < 8; r++) { nb[r] = []; for (var c = 0; c < 8; c++) nb[r][c] = board[r][c] ? { type: board[r][c].type, color: board[r][c].color } : null; }
  var moving = nb[fr][fc];
  if (moving && moving.type === 'pawn' && fc !== tc && !board[tr][tc]) {
    nb[fr][tc] = null;
  }
  if (moving && moving.type === 'king' && Math.abs(tc - fc) === 2) {
    if (tc === 6) { nb[fr][5] = nb[fr][7]; nb[fr][7] = null; }
    else if (tc === 2) { nb[fr][3] = nb[fr][0]; nb[fr][0] = null; }
  }
  nb[tr][tc] = moving;
  if (promotion && nb[tr][tc] && nb[tr][tc].type === 'pawn') nb[tr][tc] = { type: promotion, color: nb[tr][tc].color };
  nb[fr][fc] = null;
  return nb;
}

function hasLegal(board, color, state) {
  for (var fr = 0; fr < 8; fr++)
    for (var fc = 0; fc < 8; fc++) {
      var p = board[fr][fc];
      if (p && p.color === color) {
        for (var tr = 0; tr < 8; tr++)
          for (var tc = 0; tc < 8; tc++) {
            if (fr === tr && fc === tc) continue;
            if (!canMove(board, fr, fc, tr, tc, state)) continue;
            var promoRow = p.color === 'white' ? 0 : 7;
            if (p.type === 'pawn' && tr === promoRow) {
              var promos = ['queen', 'rook', 'bishop', 'knight'];
              for (var pi = 0; pi < promos.length; pi++) {
                var promotedBoard = simMove(board, fr, fc, tr, tc, promos[pi]);
                if (!inCheck(promotedBoard, color)) return true;
              }
            } else {
              var nb = simMove(board, fr, fc, tr, tc);
              if (!inCheck(nb, color)) return true;
            }
          }
      }
    }
  return false;
}

function validMove(board, fr, fc, tr, tc, color, state) {
  var piece = board[fr][fc];
  if (!piece || piece.color !== color) return false;
  if (!canMove(board, fr, fc, tr, tc, state)) return false;
  var nb = simMove(board, fr, fc, tr, tc);
  return !inCheck(nb, color);
}

function updateCastlingRights(castling, piece, fr, fc, tr, tc) {
  if (!castling) return;
  if (piece.type === 'king') {
    if (piece.color === 'white') { castling.wK = false; castling.wQ = false; }
    else { castling.bK = false; castling.bQ = false; }
  }
  if ((fr === 7 && fc === 0) || (tr === 7 && tc === 0)) castling.wQ = false;
  if ((fr === 7 && fc === 7) || (tr === 7 && tc === 7)) castling.wK = false;
  if ((fr === 0 && fc === 0) || (tr === 0 && tc === 0)) castling.bQ = false;
  if ((fr === 0 && fc === 7) || (tr === 0 && tc === 7)) castling.bK = false;
}

function processMove(room, msg) {
  if (!room || room.status !== 'playing') return { ok: false, err: 'game is not active' };
  if (!isCoordinate(msg.fr) || !isCoordinate(msg.fc) || !isCoordinate(msg.tr) || !isCoordinate(msg.tc)) {
    return { ok: false, err: 'invalid coordinates' };
  }
  if (msg.promo !== undefined && ['queen', 'rook', 'bishop', 'knight'].indexOf(msg.promo) === -1) {
    return { ok: false, err: 'invalid promotion piece' };
  }
  if (!room.castling) room.castling = initCastling();
  if (room.enPassant === undefined) room.enPassant = null;
  if (!room.moves) room.moves = [];

  var board = room.board;
  var fr = msg.fr, fc = msg.fc, tr = msg.tr, tc = msg.tc;
  var piece = board[fr][fc];
  if (!piece || piece.color !== room.turn) return { ok: false, err: 'not your turn' };
  if (!validMove(board, fr, fc, tr, tc, piece.color, room)) return { ok: false, err: 'invalid move' };

  var isEnPassant = piece.type === 'pawn' && fc !== tc && !board[tr][tc];
  var isCastling = piece.type === 'king' && Math.abs(tc - fc) === 2;
  var captured = isEnPassant ? board[fr][tc] : board[tr][tc];

  if (isEnPassant) {
    board[fr][tc] = null;
  }
  board[tr][tc] = piece;
  board[fr][fc] = null;

  if (isCastling) {
    if (tc === 6) {
      board[fr][5] = board[fr][7];
      board[fr][7] = null;
    } else if (tc === 2) {
      board[fr][3] = board[fr][0];
      board[fr][0] = null;
    }
  }

  if (piece.type === 'pawn') {
    var promoRow = piece.color === 'white' ? 0 : 7;
    if (tr === promoRow) {
      board[tr][tc] = { type: msg.promo || 'queen', color: piece.color };
    }
  }

  updateCastlingRights(room.castling, piece, fr, fc, tr, tc);
  if (piece.type === 'pawn' && Math.abs(tr - fr) === 2) {
    room.enPassant = { r: (fr + tr) / 2, c: fc };
  } else {
    room.enPassant = null;
  }

  room.turn = room.turn === 'white' ? 'black' : 'white';
  var opp = room.turn;
  var check = inCheck(board, opp);
  var legal = hasLegal(board, opp, room);
  var gameOver = !legal;
  var result = gameOver ? (check ? 'checkmate' : 'stalemate') : null;
  if (gameOver) {
    room.status = 'finished';
    room.finishedAt = Date.now();
  }

  var moveRec = {
    fr: fr,
    fc: fc,
    tr: tr,
    tc: tc,
    piece: piece,
    captured: captured,
    check: check,
    enPassant: isEnPassant,
    castling: isCastling
  };
  room.moves.push(moveRec);

  return {
    ok: true,
    board: room.board,
    currentTurn: room.turn,
    move: moveRec,
    inCheck: check,
    castling: room.castling,
    enPassant: room.enPassant,
    gameOver: gameOver,
    result: result,
    winner: gameOver && check ? piece.color : null
  };
}

function isCoordinate(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value < 8;
}

function clearPlayerDisconnectTimer(player) {
  if (player && player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function discardRoom(room) {
  if (!room) return;
  delete rooms[room.id];
  for (var i = 0; i < room.players.length; i++) {
    var player = room.players[i];
    clearPlayerDisconnectTimer(player);
    var connectedPlayer = players[player.pid];
    if (connectedPlayer && connectedPlayer.roomId === room.id) connectedPlayer.roomId = null;
  }
  room.players = [];
}

function finishRoom(room, reason, winner) {
  if (!room || room.status === 'finished') return;
  room.status = 'finished';
  room.finishedAt = Date.now();
  for (var i = 0; i < room.players.length; i++) {
    clearPlayerDisconnectTimer(room.players[i]);
  }
  sendRoom(room, {
    type: 'game_over',
    reason: reason,
    winner: winner ? winner.color : null,
    winnerName: winner ? winner.name : '',
    loser: winner && room.players.length === 2 ? (room.players[0].color === winner.color ? room.players[1].color : room.players[0].color) : null
  });
}

function detachPlayer(pl, ws, reason) {
  if (!pl || !pl.roomId) return;
  var room = rooms[pl.roomId];
  if (!room) { pl.roomId = null; return; }
  if (room.status === 'playing') {
    var winner = null;
    for (var i = 0; i < room.players.length; i++) {
      if (room.players[i].ws !== ws && room.players[i].color !== pl.color) winner = room.players[i];
    }
    finishRoom(room, reason || 'leave', winner);
  }
  discardRoom(room);
}

function restorePlayerConnection(room, roomPlayer, ws, pid) {
  var pl = players[pid];
  clearPlayerDisconnectTimer(roomPlayer);
  if (roomPlayer.pid && roomPlayer.pid !== pid && players[roomPlayer.pid]) {
    players[roomPlayer.pid].roomId = null;
  }
  roomPlayer.pid = pid;
  roomPlayer.ws = ws;
  roomPlayer.disconnected = false;
  roomPlayer.disconnectedAt = null;

  pl.roomId = room.id;
  pl.name = roomPlayer.name;
  pl.color = roomPlayer.color;
  pl.token = roomPlayer.token;

  var lastMove = room.moves && room.moves.length ? room.moves[room.moves.length - 1] : null;
  send(ws, {
    type: 'reconnected',
    roomId: room.id,
    color: roomPlayer.color,
    token: roomPlayer.token,
    status: room.status,
    board: room.board,
    currentTurn: room.turn,
    inCheck: room.board ? inCheck(room.board, room.turn) : false,
    lastMove: lastMove,
    castling: room.castling,
    enPassant: room.enPassant,
    players: room.players.map(function(p) {
      return { name: p.name, color: p.color, disconnected: !!p.disconnected };
    })
  });
  sendRoom(room, { type: 'opponent_status', status: 'reconnected', color: roomPlayer.color }, ws);
}

function roomMessageError(ws, text) {
  send(ws, { type: 'error', error: text });
}

function cleanName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  value = value.replace(/[\r\n\u0000-\u001f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, 24);
  return value || fallback;
}

function handleMessage(ws, pid, msg) {
  var pl = players[pid];
  if (!pl) return;

  if (msg.type === 'create_room') {
    if (pl.roomId) {
      var existingRoom = rooms[pl.roomId];
      if (existingRoom && existingRoom.status !== 'finished') {
        roomMessageError(ws, 'leave the current room first');
        return;
      }
      if (existingRoom) discardRoom(existingRoom);
      else pl.roomId = null;
    }
    var rid;
    do { rid = genId(); } while (rooms[rid]);
    var token = genToken();
    var room = {
      id: rid,
      players: [{ pid: pid, ws: ws, name: cleanName(msg.name, 'P1'), color: 'white', token: token, disconnected: false }],
      board: null,
      turn: 'white',
      castling: initCastling(),
      enPassant: null,
      status: 'waiting',
      createdAt: Date.now(),
      moves: []
    };
    rooms[rid] = room;
    pl.roomId = rid;
    pl.name = room.players[0].name;
    pl.color = 'white';
    pl.token = token;
    send(ws, { type: 'room_created', roomId: rid, color: 'white', token: token });
    console.log('Room ' + rid + ' created by ' + room.players[0].name);
    return;
  }

  if (msg.type === 'reconnect') {
    if (typeof msg.roomId !== 'string' || !/^[A-Z0-9]{6}$/i.test(msg.roomId) || typeof msg.token !== 'string' || !msg.token) {
      send(ws, { type: 'reconnect_failed', error: 'invalid reconnect parameters' });
      return;
    }
    var rId = msg.roomId.toUpperCase();
    var targetRoom = rooms[rId];
    if (!targetRoom || targetRoom.status === 'finished') {
      send(ws, { type: 'reconnect_failed', roomId: rId, error: 'room does not exist or game ended' });
      return;
    }
    for (var rp = 0; rp < targetRoom.players.length; rp++) {
      if (targetRoom.players[rp].token === msg.token) {
        restorePlayerConnection(targetRoom, targetRoom.players[rp], ws, pid);
        return;
      }
    }
    send(ws, { type: 'reconnect_failed', roomId: rId, error: 'reconnect token mismatch' });
    return;
  }

  if (msg.type === 'join_room') {
    if (typeof msg.roomId !== 'string' || !/^[A-Z0-9]{6}$/i.test(msg.roomId)) {
      roomMessageError(ws, 'invalid room id');
      return;
    }
    var rid2 = msg.roomId.toUpperCase();
    var room2 = rooms[rid2];
    if (room2 && room2.status !== 'finished' && typeof msg.token === 'string' && msg.token) {
      for (var k = 0; k < room2.players.length; k++) {
        if (room2.players[k].token === msg.token) {
          restorePlayerConnection(room2, room2.players[k], ws, pid);
          return;
        }
      }
    }
    if (pl.roomId) {
      var oldRoom = rooms[pl.roomId];
      if (oldRoom && oldRoom.status !== 'finished') {
        roomMessageError(ws, 'leave the current room first');
        return;
      }
      if (oldRoom) discardRoom(oldRoom);
      else pl.roomId = null;
    }
    if (!room2) { roomMessageError(ws, 'room does not exist'); return; }
    if (room2.players.length >= 2) { roomMessageError(ws, 'room is full'); return; }
    if (room2.status !== 'waiting') { roomMessageError(ws, 'game has already started'); return; }
    if (room2.players[0] && room2.players[0].disconnected) { roomMessageError(ws, 'room creator is offline'); return; }
    var joinToken = genToken();
    var joiningPlayer = { pid: pid, ws: ws, name: cleanName(msg.name, 'P2'), color: 'black', token: joinToken, disconnected: false };
    pl.name = joiningPlayer.name;
    pl.color = 'black';
    pl.roomId = rid2;
    pl.token = joinToken;
    room2.players.push(joiningPlayer);
    room2.board = initBoard();
    room2.castling = initCastling();
    room2.enPassant = null;
    room2.status = 'playing';
    room2.turn = 'white';
    send(ws, {
      type: 'room_joined',
      roomId: rid2,
      color: 'black',
      token: joinToken,
      board: room2.board,
      castling: room2.castling,
      enPassant: room2.enPassant
    });
    sendRoom(room2, {
      type: 'game_start',
      roomId: rid2,
      board: room2.board,
      currentTurn: 'white',
      castling: room2.castling,
      enPassant: room2.enPassant,
      players: room2.players.map(function(p) { return { name: p.name, color: p.color }; })
    });
    console.log(joiningPlayer.name + ' joined room ' + rid2);
    return;
  }

  if (msg.type === 'move') {
    var room3 = rooms[pl.roomId];
    if (!room3 || room3.status !== 'playing') { roomMessageError(ws, 'game is not active'); return; }
    var res = processMove(room3, msg);
    if (res.ok) sendRoom(room3, Object.assign({ type: 'move_made' }, res));
    else roomMessageError(ws, res.err);
    return;
  }

  if (msg.type === 'resign') {
    var room4 = rooms[pl.roomId];
    if (room4 && room4.status === 'playing') {
      var winner = null;
      for (var j = 0; j < room4.players.length; j++) {
        if (room4.players[j].ws !== ws && room4.players[j].color !== pl.color) winner = room4.players[j];
      }
      finishRoom(room4, 'resign', winner);
    }
    return;
  }

  if (msg.type === 'leave_room') {
    detachPlayer(pl, ws, 'leave');
    return;
  }

  roomMessageError(ws, 'unknown message type');
}

function cleanupExpiredRooms() {
  var now = Date.now();
  for (var id in rooms) {
    if (!rooms.hasOwnProperty(id)) continue;
    var room = rooms[id];
    if (room.status === 'playing') continue;
    var ttl = room.status === 'finished' ? 10 * 60 * 1000 : 60 * 60 * 1000;
    var timestamp = room.status === 'finished' ? room.finishedAt : room.createdAt;
    if (timestamp && now - timestamp >= ttl) discardRoom(room);
  }
}

var cleanupTimer = setInterval(cleanupExpiredRooms, 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

wss.on('connection', function(ws) {
  var pid = Math.random().toString(36).substr(2, 9);
  players[pid] = { ws: ws, roomId: null, name: '', color: null, token: null };
  send(ws, { type: 'connected', playerId: pid });

  ws.on('message', function(raw) {
    var msg;
    try {
      msg = JSON.parse(raw);
      if (!msg || typeof msg !== 'object' || Object.prototype.toString.call(msg) === '[object Array]' || typeof msg.type !== 'string') {
        roomMessageError(ws, 'invalid message');
        return;
      }
      handleMessage(ws, pid, msg);
    } catch(e) {
      console.error('Invalid client message:', e.message);
      roomMessageError(ws, 'invalid message');
    }
  });

  ws.on('close', function() {
    var pl = players[pid];
    if (pl && pl.roomId) {
      var room = rooms[pl.roomId];
      if (room) {
        var roomPlayer = null;
        for (var i = 0; i < room.players.length; i++) {
          if (room.players[i].pid === pid || room.players[i].ws === ws) {
            roomPlayer = room.players[i];
            break;
          }
        }
        if (roomPlayer && (room.status === 'playing' || room.status === 'waiting')) {
          roomPlayer.disconnected = true;
          roomPlayer.disconnectedAt = Date.now();
          roomPlayer.ws = null;
          clearPlayerDisconnectTimer(roomPlayer);
          if (room.status === 'playing') {
            sendRoom(room, { type: 'opponent_status', status: 'disconnected', graceMs: reconnectGraceMs }, ws);
          }
          // 等待中的房间不设宽限删除计时器：创建者可随时用令牌重连，过期由 cleanupExpiredRooms 统一处理
          if (room.status === 'playing') {
            roomPlayer.disconnectTimer = setTimeout(function() {
              roomPlayer.disconnectTimer = null;
              if (!rooms[room.id] || !roomPlayer.disconnected) return;
              var winner = null;
              for (var j = 0; j < room.players.length; j++) {
                if (room.players[j] !== roomPlayer && !room.players[j].disconnected) winner = room.players[j];
              }
              finishRoom(room, 'disconnect', winner);
              discardRoom(room);
            }, reconnectGraceMs);
            if (roomPlayer.disconnectTimer.unref) roomPlayer.disconnectTimer.unref();
          }
        } else if (room.status === 'finished') {
          discardRoom(room);
        }
      }
    }
    delete players[pid];
    console.log('Player disconnected');
  });
});

if (require.main === module) {
  server.listen(PORT, function() {
    console.log('Chess server running on port ' + PORT);
  });
}

module.exports = {
  server: server,
  wss: wss,
  rooms: rooms,
  players: players,
  initBoard: initBoard,
  initCastling: initCastling,
  canMove: canMove,
  attacked: attacked,
  inCheck: inCheck,
  processMove: processMove,
  cleanupExpiredRooms: cleanupExpiredRooms,
  setReconnectGraceMs: setReconnectGraceMs
};
