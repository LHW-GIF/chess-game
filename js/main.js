var ChessBoard = require('./board');
var Renderer = require('./renderer');
var Socket = require('./socket');

var mainCanvas = wx.createCanvas();
var ctx = mainCanvas.getContext('2d');
var renderer = new Renderer(ctx, mainCanvas);
var socket = new Socket();
var board = null;

var state = 'menu';
var myColor = null;
var roomId = '';
var reconnectToken = '';
var oppName = '';
var promoPending = null;
var promoBtns = [];
var gameBtns = [];
var menuBtns = [];
var toastText = '';
var toastTime = 0;
var overMsg = '';
var reconnecting = false;

function Main() {
  var self = this;

  wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
  wx.onShareAppMessage(function() {
    return { title: '\u6765\u73a9\u56fd\u9645\u8c61\u68cb', path: roomId ? '/game.js?room=' + roomId : '/game.js' };
  });

  var launch = wx.getLaunchOptionsSync();
  var shareRoom = launch && launch.query && launch.query.room ? launch.query.room : '';

  wx.onTouchStart(function(e) {
    var t = e.touches[0];
    self.handleTap(t.clientX, t.clientY);
  });

  if (typeof wx.onShow === 'function') {
    wx.onShow(function(opts) {
      var qRoom = opts && opts.query && opts.query.room ? opts.query.room : '';
      if (qRoom && !roomId) {
        socket.connect(function() {
          socket.send({ type: 'join_room', roomId: qRoom, name: '\u73a9\u5bb6' });
        }, function() { toast('\u52a0\u5165\u623f\u95f4\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u9080\u8bf7'); });
      } else if (roomId && reconnectToken && !socket.connected) {
        tryReconnect();
      }
    });
  }

  if (shareRoom) {
    socket.connect(function() {
      socket.send({ type: 'join_room', roomId: shareRoom, name: '\u73a9\u5bb6' });
    }, function() { toast('\u52a0\u5165\u623f\u95f4\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u9080\u8bf7'); });
  }
  this.render();
}

Main.prototype.render = function() {
  var self = this;
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

  if (state === 'menu' || state === 'waiting') {
    self.renderMenu();
  } else if (state === 'playing' && board) {
    gameBtns = renderer.drawBar(
      oppName || '\u5bf9\u624b',
      '\u4f60',
      myColor, board.turn
    );
    renderer.drawBoard(board);
    promoBtns = promoPending ? renderer.drawPromotion(myColor) : [];
  }

  if (toastText && Date.now() < toastTime) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    var tw = ctx.measureText(toastText).width + 30;
    ctx.fillRect(mainCanvas.width / 2 - tw / 2, mainCanvas.height / 2 - 25, tw, 50);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(toastText, mainCanvas.width / 2, mainCanvas.height / 2 + 5);
  }

  requestAnimationFrame(function() { self.render(); });
};

Main.prototype.renderMenu = function() {
  var cw = mainCanvas.width;
  var bw = 200, bh = 50, bx = (cw - bw) / 2;
  menuBtns = [];

  if (state === 'menu' && !roomId) {
    renderer.drawMenu([]);
    menuBtns.push({ x: bx, y: mainCanvas.height / 2 - 25, w: bw, h: bh, id: 'start', label: '\u5f00\u59cb\u6e38\u620f' });
    renderer.drawMenu(menuBtns);
  } else if (state === 'menu' && roomId) {
    renderer.drawMenu([]);
    renderer.drawText(cw / 2, 250, overMsg || '\u6e38\u620f\u7ed3\u675f', 28, '#e94560');
    menuBtns.push({ x: (cw - 180) / 2, y: 330, w: 180, h: bh, id: 'back', label: '\u8fd4\u56de' });
    renderer.drawMenu(menuBtns);
  } else if (state === 'waiting') {
    renderer.drawMenu([]);
    renderer.drawText(cw / 2, 180, '\u7b49\u5f85\u5bf9\u624b...', 18, '#fff');
    renderer.drawText(cw / 2, 250, roomId, 32, '#e94560');
    menuBtns.push({ x: (cw - 200) / 2, y: 330, w: 200, h: 50, id: 'share', label: '\u9080\u8bf7\u597d\u53cb' });
    menuBtns.push({ x: (cw - 150) / 2, y: 410, w: 150, h: 40, id: 'cancel', label: '\u53d6\u6d88' });
    renderer.drawMenu(menuBtns);
  }
};

Main.prototype.handleTap = function(x, y) {
  if (state === 'menu' || state === 'waiting') {
    for (var i = 0; i < menuBtns.length; i++) {
      var b = menuBtns[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.onMenuBtn(b.id);
        return;
      }
    }
    return;
  }

  if (state !== 'playing') return;

  if (promoBtns.length > 0) {
    for (var j = 0; j < promoBtns.length; j++) {
      var pb = promoBtns[j];
      if (x >= pb.x && x <= pb.x + pb.w && y >= pb.y && y <= pb.y + pb.h) {
        if (promoPending) {
          socket.send({ type: 'move', fr: promoPending.fr, fc: promoPending.fc, tr: promoPending.tr, tc: promoPending.tc, promo: pb.piece });
          promoPending = null;
          board.deselect();
        }
        promoBtns = [];
        return;
      }
    }
    return;
  }

  for (var k = 0; k < gameBtns.length; k++) {
    if (gameBtns[k].id === 'resign' && x >= gameBtns[k].x && x <= gameBtns[k].x + gameBtns[k].w && y >= gameBtns[k].y && y <= gameBtns[k].y + gameBtns[k].h) {
      socket.send({ type: 'resign' });
      overMsg = '\u4f60\u8ba4\u8f93\u4e86';
      state = 'menu';
      return;
    }
  }

  if (!board || board.turn !== myColor) return;
  var pos = renderer.hitTest(x, y);
  if (!pos) return;

  if (board.selected) {
    if (board.isValidTarget(pos.r, pos.c)) {
      var piece = board.get(board.selected.r, board.selected.c);
      if (piece.type === 'pawn' && (piece.color === 'white' ? pos.r === 0 : pos.r === 7)) {
        promoPending = { fr: board.selected.r, fc: board.selected.c, tr: pos.r, tc: pos.c };
        promoBtns = [];
        return;
      }
      socket.send({ type: 'move', fr: board.selected.r, fc: board.selected.c, tr: pos.r, tc: pos.c });
      board.deselect();
    } else if (board.canSelect(pos.r, pos.c)) {
      board.select(pos.r, pos.c);
    } else {
      board.deselect();
    }
  } else {
    board.select(pos.r, pos.c);
  }
};

Main.prototype.onMenuBtn = function(id) {
  if (id === 'start') {
    toast('\u6b63\u5728\u8fde\u63a5\u670d\u52a1\u5668...');
    socket.connect(function() {
      socket.send({ type: 'create_room', name: '\u73a9\u5bb6' });
    }, function() { toast('\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'); });
  } else if (id === 'share') {
    wx.shareAppMessage({ title: '\u6765\u73a9\u56fd\u9645\u8c61\u68cb', path: '/game.js?room=' + roomId });
  } else if (id === 'cancel') {
    socket.send({ type: 'leave_room' });
    roomId = '';
    reconnectToken = '';
    myColor = null;
    board = null;
    state = 'menu';
  } else if (id === 'back') {
    socket.send({ type: 'leave_room' });
    roomId = '';
    reconnectToken = '';
    myColor = null;
    board = null;
    promoPending = null;
    promoBtns = [];
    overMsg = '';
    state = 'menu';
  }
};

function toast(msg) {
  toastText = msg;
  toastTime = Date.now() + 2000;
}

function tryReconnect() {
  if (reconnecting || !roomId || !reconnectToken) return;
  reconnecting = true;
  toast('\u7f51\u7edc\u6ce2\u52a8\uff0c\u6b63\u5728\u91cd\u8fde...');
  socket.connect(function() {
    reconnecting = false;
    socket.send({ type: 'reconnect', roomId: roomId, token: reconnectToken });
  }, function() {
    reconnecting = false;
    overMsg = '\u8fde\u63a5\u65ad\u5f00';
    state = 'menu';
  });
}

socket.on('room_created', function(data) {
  roomId = data.roomId;
  myColor = data.color;
  reconnectToken = data.token || '';
  state = 'waiting';
});

socket.on('room_joined', function(data) {
  roomId = data.roomId;
  myColor = data.color;
  reconnectToken = data.token || '';
});

socket.on('game_start', function(data) {
  state = 'playing';
  board = new ChessBoard();
  board.myColor = myColor;
  board.setBoard(data.board);
  board.turn = data.currentTurn;
  if (data.castling) board.castling = data.castling;
  board.enPassant = data.enPassant || null;
  if (data.players && data.players.length >= 2) {
    for (var i = 0; i < data.players.length; i++) {
      if (data.players[i].color !== myColor) oppName = data.players[i].name;
    }
  }
});

socket.on('reconnected', function(data) {
  roomId = data.roomId;
  myColor = data.color;
  reconnectToken = data.token || reconnectToken;
  if (data.status === 'waiting') {
    state = 'waiting';
    toast('\u5df2\u6062\u590d\u623f\u95f4');
    return;
  }
  state = 'playing';
  board = new ChessBoard();
  board.myColor = myColor;
  board.setBoard(data.board);
  board.turn = data.currentTurn;
  board.inCheck = !!data.inCheck;
  board.lastMove = data.lastMove || null;
  if (data.castling) board.castling = data.castling;
  board.enPassant = data.enPassant || null;
  if (data.players && data.players.length >= 2) {
    for (var i = 0; i < data.players.length; i++) {
      if (data.players[i].color !== myColor) oppName = data.players[i].name;
    }
  }
  toast('\u5df2\u91cd\u8fde\u5bf9\u5c40');
});

socket.on('reconnect_failed', function() {
  reconnectToken = '';
  overMsg = '\u5bf9\u5c40\u5df2\u7ed3\u675f\u6216\u623f\u95f4\u5931\u6548';
  state = 'menu';
});

socket.on('opponent_status', function(data) {
  if (data.status === 'disconnected') {
    toast('\u5bf9\u624b\u7f51\u7edc\u65ad\u5f00\uff0c\u7b49\u5f85\u91cd\u8fde...');
  } else if (data.status === 'reconnected') {
    toast('\u5bf9\u624b\u5df2\u91cd\u8fde');
  }
});

socket.on('move_made', function(data) {
  if (data.board) board.setBoard(data.board);
  board.turn = data.currentTurn;
  board.lastMove = data.move;
  board.inCheck = data.inCheck;
  if (data.castling) board.castling = data.castling;
  board.enPassant = data.enPassant || null;
  board.deselect();
  if (data.gameOver) {
    reconnectToken = '';
    setTimeout(function() {
      if (data.result === 'checkmate') {
        overMsg = data.winner === myColor ? '\u4f60\u8d62\u4e86\uff01' : '\u4f60\u8f93\u4e86\uff01';
      } else {
        overMsg = '\u548c\u68cb';
      }
      state = 'menu';
    }, 800);
    socket.send({ type: 'leave_room' });
  }
});

socket.on('game_over', function(data) {
  reconnectToken = '';
  if (data.reason === 'resign') {
    overMsg = data.winner === myColor ? '\u5bf9\u624b\u8ba4\u8f93\u4e86\uff0c\u4f60\u8d62\u4e86\uff01' : '\u4f60\u8ba4\u8f93\u4e86\uff0c\u4f60\u8f93\u4e86\uff01';
  } else if (data.reason === 'disconnect') {
    overMsg = '\u5bf9\u624b\u65ad\u5f00\u8fde\u63a5\uff0c\u4f60\u8d62\u4e86\uff01';
  } else if (data.winner === myColor) {
    overMsg = '\u5bf9\u624b\u79bb\u5f00\u4e86\uff0c\u4f60\u8d62\u4e86\uff01';
  } else {
    overMsg = '\u4f60\u79bb\u5f00\u4e86\u5bf9\u5c40';
  }
  promoPending = null;
  promoBtns = [];
  state = 'menu';
  socket.send({ type: 'leave_room' });
});

socket.on('opponent_left', function() {
  reconnectToken = '';
  overMsg = '\u5bf9\u624b\u79bb\u5f00\u4e86\uff01\u4f60\u8d62\u4e86\uff01';
  state = 'menu';
});

socket.on('error', function(data) { toast(data.error); });
socket.on('disconnect', function() {
  if ((state === 'playing' || state === 'waiting') && roomId && reconnectToken) {
    setTimeout(tryReconnect, 600);
  } else if (state === 'playing') {
    overMsg = '\u8fde\u63a5\u65ad\u5f00';
    state = 'menu';
  }
});

module.exports = Main;
