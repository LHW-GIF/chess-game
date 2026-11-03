var assert = require('assert');
var WebSocket = require('ws');
var chess = require('./server');
var ChessBoard = require('../js/board');
var url = 'ws://localhost:43879';

function emptyBoard() {
  var board = [];
  for (var r = 0; r < 8; r++) {
    board[r] = [];
    for (var c = 0; c < 8; c++) board[r][c] = null;
  }
  return board;
}

function testRules() {
  var board = emptyBoard();
  board[0][0] = { type: 'king', color: 'white' };
  board[0][7] = { type: 'king', color: 'black' };
  assert.strictEqual(chess.attacked(board, 0, 0, 'black'), false, 'a distant king must not attack along a row');
  board[0][1] = board[0][7];
  board[0][7] = null;
  assert.strictEqual(chess.attacked(board, 0, 0, 'black'), true, 'an adjacent king must attack');

  var clientBoard = new ChessBoard();
  board = emptyBoard();
  board[7][4] = { type: 'king', color: 'white' };
  board[6][4] = { type: 'rook', color: 'white' };
  board[0][4] = { type: 'rook', color: 'black' };
  board[0][0] = { type: 'king', color: 'black' };
  clientBoard.setBoard(board);
  clientBoard.myColor = 'white';
  clientBoard.select(6, 4);
  assert.strictEqual(clientBoard.isValidTarget(6, 5), false, 'client hints must filter self-check moves');
  assert.strictEqual(clientBoard.isValidTarget(5, 4), true, 'a pinned piece may move while continuing to block check');

  board = emptyBoard();
  board[4][4] = { type: 'rook', color: 'white' };
  board[4][6] = { type: 'king', color: 'black' };
  assert.strictEqual(chess.canMove(board, 4, 4, 4, 6), false, 'a piece cannot capture the opposing king');

  var room = { board: chess.initBoard(), turn: 'white', status: 'playing', moves: [] };
  var moves = [
    [6, 5, 5, 5], // f2-f3
    [1, 4, 3, 4], // e7-e5
    [6, 6, 4, 6], // g2-g4
    [0, 3, 4, 7]  // Qd8-h4, checkmate
  ];
  var result;
  for (var i = 0; i < moves.length; i++) {
    result = chess.processMove(room, { fr: moves[i][0], fc: moves[i][1], tr: moves[i][2], tc: moves[i][3] });
    assert.strictEqual(result.ok, true, 'expected legal move ' + (i + 1));
    room.turn = result.currentTurn;
  }
  assert.strictEqual(result.gameOver, true, 'Fool\'s Mate should end the game');
  assert.strictEqual(result.result, 'checkmate');
  assert.strictEqual(room.status, 'finished');
  assert.strictEqual(chess.processMove(room, { fr: 1, fc: 0, tr: 2, tc: 0 }).ok, false, 'moves after checkmate must be rejected');
  assert.strictEqual(chess.processMove({ board: chess.initBoard(), turn: 'white', status: 'playing' }, { fr: -1, fc: 0, tr: 0, tc: 0 }).ok, false, 'out-of-range coordinates must be rejected');
  assert.strictEqual(chess.processMove({ board: chess.initBoard(), turn: 'white', status: 'playing' }, { fr: 6, fc: 0, tr: 5, tc: 0, promo: 'king' }).ok, false, 'invalid promotion pieces must be rejected');

  board = emptyBoard();
  board[7][7] = { type: 'king', color: 'white' };
  board[0][7] = { type: 'king', color: 'black' };
  board[1][0] = { type: 'pawn', color: 'white' };
  room = { board: board, turn: 'white', status: 'playing', moves: [] };
  result = chess.processMove(room, { fr: 1, fc: 0, tr: 0, tc: 0, promo: 'knight' });
  assert.strictEqual(result.ok, true, 'a legal promotion should be accepted');
  assert.strictEqual(room.board[0][0].type, 'knight', 'the requested promotion piece must be applied');

  // 王车易位测试（服务端 + 小游戏客户端提示）
  board = emptyBoard();
  board[7][4] = { type: 'king', color: 'white' };
  board[7][7] = { type: 'rook', color: 'white' };
  board[7][0] = { type: 'rook', color: 'white' };
  board[0][4] = { type: 'king', color: 'black' };
  clientBoard = new ChessBoard();
  clientBoard.setBoard(board);
  clientBoard.myColor = 'white';
  clientBoard.select(7, 4);
  assert.strictEqual(clientBoard.isValidTarget(7, 6), true, 'client hints must allow white king-side castling');
  assert.strictEqual(clientBoard.isValidTarget(7, 2), true, 'client hints must allow white queen-side castling');

  // 经过被攻击格时禁止王车易位
  board[0][5] = { type: 'rook', color: 'black' };
  clientBoard.setBoard(board);
  clientBoard.select(7, 4);
  assert.strictEqual(clientBoard.isValidTarget(7, 6), false, 'castling through an attacked square must be rejected');
  board[0][5] = null;

  room = { board: board, turn: 'white', status: 'playing', castling: chess.initCastling(), enPassant: null, moves: [] };
  result = chess.processMove(room, { fr: 7, fc: 4, tr: 7, tc: 6 });
  assert.strictEqual(result.ok, true, 'server must accept legal king-side castling');
  assert.strictEqual(room.board[7][6].type, 'king', 'king must land on g1');
  assert.strictEqual(room.board[7][5].type, 'rook', 'rook must move to f1');
  assert.strictEqual(room.board[7][7], null, 'h1 must be empty after castling');
  assert.strictEqual(room.castling.wK, false, 'white castling rights must be cleared');
  assert.strictEqual(room.castling.wQ, false, 'white queen-side castling rights must also be cleared');

  // 吃过路兵测试（服务端 + 小游戏客户端提示 + 牵制禁走）
  board = emptyBoard();
  board[7][4] = { type: 'king', color: 'white' };
  board[0][4] = { type: 'king', color: 'black' };
  board[3][4] = { type: 'pawn', color: 'white' };
  board[1][3] = { type: 'pawn', color: 'black' };
  room = { board: board, turn: 'black', status: 'playing', castling: chess.initCastling(), enPassant: null, moves: [] };
  result = chess.processMove(room, { fr: 1, fc: 3, tr: 3, tc: 3 });
  assert.strictEqual(result.ok, true, 'black double pawn push should succeed');
  assert.deepStrictEqual(room.enPassant, { r: 2, c: 3 }, 'enPassant target square must be d6');

  clientBoard = new ChessBoard();
  clientBoard.setBoard(room.board);
  clientBoard.myColor = 'white';
  clientBoard.turn = 'white';
  clientBoard.enPassant = room.enPassant;
  clientBoard.select(3, 4);
  assert.strictEqual(clientBoard.isValidTarget(2, 3), true, 'client hints must allow en passant capture');

  result = chess.processMove(room, { fr: 3, fc: 4, tr: 2, tc: 3 });
  assert.strictEqual(result.ok, true, 'server must accept legal en passant capture');
  assert.strictEqual(room.board[2][3].type, 'pawn', 'capturing pawn must land on d6');
  assert.strictEqual(room.board[3][3], null, 'captured pawn on d5 must be removed');

  // 逼和（stalemate）测试
  board = emptyBoard();
  board[0][0] = { type: 'king', color: 'black' };
  board[2][1] = { type: 'king', color: 'white' };
  board[2][2] = { type: 'queen', color: 'white' };
  room = { board: board, turn: 'white', status: 'playing', castling: { wK: false, wQ: false, bK: false, bQ: false }, enPassant: null, moves: [] };
  result = chess.processMove(room, { fr: 2, fc: 2, tr: 1, tc: 2 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.gameOver, true);
  assert.strictEqual(result.result, 'stalemate');
  assert.strictEqual(result.winner, null, 'stalemate must have no winner');

  console.log('规则回归测试通过：王的攻击范围、自王安全提示、升变、王车易位、吃过路兵、逼和、将杀结束和走棋字段校验');
}

function expectMessage(ws, type, timeout) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      ws.removeListener('message', onMessage);
      reject(new Error('等待消息超时: ' + type));
    }, timeout || 3000);
    function onMessage(raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch(e) { return; }
      if (msg.type !== type) return;
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      resolve(msg);
    }
    ws.on('message', onMessage);
  });
}

function openClient() {
  return new Promise(function(resolve, reject) {
    var ws = new WebSocket(url);
    var opened = false;
    var connected = false;
    var timer = setTimeout(function() {
      ws.close();
      reject(new Error('连接本地服务端超时'));
    }, 3000);
    function completeIfReady() {
      if (opened && connected) {
        clearTimeout(timer);
        resolve(ws);
      }
    }
    ws.on('message', function(raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch(e) { return; }
      if (msg.type === 'connected') {
        connected = true;
        completeIfReady();
      }
    });
    ws.once('open', function() {
      opened = true;
      completeIfReady();
    });
    ws.once('error', function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function closeClient(ws) {
  if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise(function(resolve) {
    var timer = setTimeout(resolve, 500);
    ws.once('close', function() {
      clearTimeout(timer);
      resolve();
    });
    ws.close();
  });
}

function testProtocol() {
  var p1, p2;
  var roomInfo;
  return Promise.all([openClient(), openClient()]).then(function(clients) {
    p1 = clients[0];
    p2 = clients[1];
    var invalidRoom = expectMessage(p2, 'error');
    p2.send(JSON.stringify({ type: 'join_room' }));
    return invalidRoom;
  }).then(function() {
    var malformed = expectMessage(p2, 'error');
    p2.send('{invalid-json');
    return malformed;
  }).then(function() {
    var created = expectMessage(p1, 'room_created');
    p1.send(JSON.stringify({ type: 'create_room', name: '白方' }));
    return created;
  }).then(function(room) {
    roomInfo = room;
    assert.strictEqual(typeof room.token, 'string', 'room_created must include reconnect token');
    var joined = expectMessage(p2, 'room_joined');
    var start1 = expectMessage(p1, 'game_start');
    var start2 = expectMessage(p2, 'game_start');
    p2.send(JSON.stringify({ type: 'join_room', roomId: room.roomId, name: '黑方' }));
    return Promise.all([joined, start1, start2]);
  }).then(function() {
    var badMove = expectMessage(p1, 'error');
    p1.send(JSON.stringify({ type: 'move', fr: -1, fc: 4, tr: 4, tc: 4 }));
    return badMove;
  }).then(function() {
    var duplicateRoom = expectMessage(p1, 'error');
    p1.send(JSON.stringify({ type: 'create_room' }));
    return duplicateRoom;
  }).then(function() {
    var whiteMove = expectMessage(p1, 'move_made');
    var whiteMoveForBlack = expectMessage(p2, 'move_made');
    p1.send(JSON.stringify({ type: 'move', fr: 6, fc: 4, tr: 4, tc: 4 }));
    return Promise.all([whiteMove, whiteMoveForBlack]);
  }).then(function() {
    var blackMove = expectMessage(p1, 'move_made');
    var blackMoveForBlack = expectMessage(p2, 'move_made');
    p2.send(JSON.stringify({ type: 'move', fr: 1, fc: 4, tr: 3, tc: 4 }));
    return Promise.all([blackMove, blackMoveForBlack]);
  }).then(function() {
    var oppDisconnected = expectMessage(p2, 'opponent_status');
    return closeClient(p1).then(function() {
      return oppDisconnected;
    });
  }).then(function(statusMsg) {
    assert.strictEqual(statusMsg.status, 'disconnected');
    return openClient();
  }).then(function(newP1) {
    p1 = newP1;
    var reconnected = expectMessage(p1, 'reconnected');
    var oppReconnected = expectMessage(p2, 'opponent_status');
    p1.send(JSON.stringify({ type: 'reconnect', roomId: roomInfo.roomId, token: roomInfo.token }));
    return Promise.all([reconnected, oppReconnected]);
  }).then(function(reconnectRes) {
    assert.strictEqual(reconnectRes[0].roomId, roomInfo.roomId);
    assert.strictEqual(reconnectRes[0].color, 'white');
    assert.strictEqual(reconnectRes[0].currentTurn, 'white');
    assert.strictEqual(reconnectRes[1].status, 'reconnected');
    var knightMove1 = expectMessage(p1, 'move_made');
    var knightMove2 = expectMessage(p2, 'move_made');
    p1.send(JSON.stringify({ type: 'move', fr: 7, fc: 6, tr: 5, tc: 5 }));
    return Promise.all([knightMove1, knightMove2]);
  }).then(function() {
    var resigning = expectMessage(p1, 'game_over');
    var opponent = expectMessage(p2, 'game_over');
    p1.send(JSON.stringify({ type: 'resign' }));
    return Promise.all([resigning, opponent]);
  }).then(function(results) {
    assert.strictEqual(results[0].reason, 'resign');
    assert.strictEqual(results[0].winner, 'black');
    assert.strictEqual(results[0].loser, 'white');
    assert.strictEqual(results[1].winner, 'black');
    var newRoom = expectMessage(p2, 'room_created');
    p2.send(JSON.stringify({ type: 'create_room', name: '再次开局' }));
    return newRoom;
  }).then(function() {
    console.log('联机回归测试通过：房间、异常消息、走棋、断线重连、认输结果和再次开局');
  }).finally(function() {
    return Promise.all([closeClient(p1), closeClient(p2)]);
  });
}

testRules();
testProtocol().then(function() {
  process.exit(0);
}, function(err) {
  console.error('测试失败:', err.stack || err);
  process.exit(1);
});

setTimeout(function() {
  console.error('测试超时');
  process.exit(1);
}, 10000);
