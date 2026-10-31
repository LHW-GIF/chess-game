var SYMBOLS = {
  white: { king: '\u2654', queen: '\u2655', rook: '\u2656', bishop: '\u2657', knight: '\u2658', pawn: '\u2659' },
  black: { king: '\u265A', queen: '\u265B', rook: '\u265C', bishop: '\u265D', knight: '\u265E', pawn: '\u265F' }
};

function Renderer(ctx, cvs) {
  this.ctx = ctx;
  this.cvs = cvs;
  this.w = cvs.width;
  this.h = cvs.height;
  this.padding = 10;
  this.boardSize = Math.min(this.w - this.padding * 2, this.h - 180);
  this.cell = this.boardSize / 8;
  this.ox = (this.w - this.boardSize) / 2;
  this.oy = 90;
  this.lightBg = '#F0D9B5';
  this.darkBg = '#B58863';
  this.selectBg = 'rgba(255,255,0,0.5)';
  this.moveBg = 'rgba(0,100,255,0.5)';
  this.lastBg = 'rgba(155,199,0,0.4)';
  this.checkBg = 'rgba(255,0,0,0.5)';
}

Renderer.prototype.drawBoard = function(board) {
  var ctx = this.ctx;
  var r, c, x, y;

  for (r = 0; r < 8; r++) {
    for (c = 0; c < 8; c++) {
      x = this.ox + c * this.cell;
      y = this.oy + r * this.cell;
      ctx.fillStyle = (r + c) % 2 === 0 ? this.lightBg : this.darkBg;
      ctx.fillRect(x, y, this.cell, this.cell);
    }
  }

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(this.ox, this.oy, this.boardSize, this.boardSize);

  if (board.lastMove) {
    this.drawCell(board.lastMove.fr, board.lastMove.fc, this.lastBg);
    this.drawCell(board.lastMove.tr, board.lastMove.tc, this.lastBg);
  }
  if (board.selected) {
    this.drawCell(board.selected.r, board.selected.c, this.selectBg);
  }
  for (var i = 0; i < board.validMoves.length; i++) {
    this.drawCell(board.validMoves[i].r, board.validMoves[i].c, this.moveBg);
  }
  if (board.inCheck) {
    var kp = this.findKing(board);
    if (kp) this.drawCell(kp.r, kp.c, this.checkBg);
  }

  for (r = 0; r < 8; r++) {
    for (c = 0; c < 8; c++) {
      var piece = board.get(r, c);
      if (piece) this.drawPiece(r, c, piece);
    }
  }

  this.drawCoords(board);
};

Renderer.prototype.drawCell = function(r, c, color) {
  this.ctx.fillStyle = color;
  this.ctx.fillRect(this.ox + c * this.cell, this.oy + r * this.cell, this.cell, this.cell);
};

Renderer.prototype.findKing = function(board) {
  for (var r = 0; r < 8; r++) {
    for (var c = 0; c < 8; c++) {
      var p = board.get(r, c);
      if (p && p.type === 'king' && p.color === board.myColor) return { r: r, c: c };
    }
  }
  return null;
};

Renderer.prototype.drawPiece = function(r, c, piece) {
  var ctx = this.ctx;
  var x = this.ox + c * this.cell + this.cell / 2;
  var y = this.oy + r * this.cell + this.cell / 2;
  var sym = SYMBOLS[piece.color][piece.type];
  ctx.font = (this.cell * 0.7) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(sym, x + 1, y + 1);
  ctx.fillStyle = piece.color === 'white' ? '#fff' : '#333';
  ctx.fillText(sym, x, y);
};

Renderer.prototype.drawCoords = function(board) {
  var ctx = this.ctx;
  ctx.font = '12px Arial';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var files = 'abcdefgh';
  var ranks = board.myColor === 'white' ? '87654321' : '12345678';
  var i;
  for (i = 0; i < 8; i++) {
    ctx.fillText(files[i], this.ox + i * this.cell + this.cell / 2, this.oy + this.boardSize + 14);
  }
  for (i = 0; i < 8; i++) {
    ctx.fillText(ranks[i], this.ox - 12, this.oy + i * this.cell + this.cell / 2);
  }
};

Renderer.prototype.hitTest = function(x, y) {
  var c = Math.floor((x - this.ox) / this.cell);
  var r = Math.floor((y - this.oy) / this.cell);
  if (r >= 0 && r < 8 && c >= 0 && c < 8) return { r: r, c: c };
  return null;
};

Renderer.prototype.drawMenu = function(btns) {
  var ctx = this.ctx;
  var g = ctx.createLinearGradient(0, 0, 0, this.h);
  g.addColorStop(0, '#1a1a2e');
  g.addColorStop(1, '#16213e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, this.w, this.h);

  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#e94560';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u56fd\u9645\u8c61\u68cb', this.w / 2, 80);
  ctx.font = '16px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Chess Online', this.w / 2, 115);

  for (var i = 0; i < btns.length; i++) {
    var b = btns[i];
    ctx.fillStyle = b.red ? '#666' : '#e94560';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#ff6b81';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.font = '18px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
  }
};

Renderer.prototype.drawInput = function(x, y, w, h, text, active) {
  var ctx = this.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = active ? '#e94560' : '#999';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.font = '16px Arial';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || '\u70b9\u51fb\u8f93\u5165...', x + w / 2, y + h / 2);
};

Renderer.prototype.drawText = function(x, y, text, size, color) {
  this.ctx.font = size + 'px Arial';
  this.ctx.fillStyle = color || '#fff';
  this.ctx.textAlign = 'center';
  this.ctx.textBaseline = 'middle';
  this.ctx.fillText(text, x, y);
};

Renderer.prototype.drawBar = function(topName, botName, myColor, turn) {
  var ctx = this.ctx;
  var barH = 80;
  ctx.fillStyle = '#0f0f23';
  ctx.fillRect(0, 0, this.w, 40);
  ctx.fillRect(0, this.h - barH, this.w, barH);

  var topColor = myColor === 'white' ? 'black' : 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aaa';
  ctx.fillText(topName || '\u5bf9\u624b', 15, 26);
  ctx.fillText(botName || '\u4f60', 15, this.h - barH + 30);
  ctx.textAlign = 'right';
  ctx.fillText(topColor === 'white' ? '\u767d\u65b9' : '\u9ed1\u65b9', this.w - 15, 26);
  ctx.fillText(myColor === 'white' ? '\u767d\u65b9' : '\u9ed1\u65b9', this.w - 15, this.h - barH + 30);

  var isMyTurn = turn === myColor;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = isMyTurn ? '#4CAF50' : '#f44336';
  ctx.fillText(isMyTurn ? '\u4f60\u7684\u56de\u5408' : '\u5bf9\u65b9\u56de\u5408', this.w / 2, this.h - barH + 30);

  var bw = 70, bh = 32;
  var bx = this.w / 2 - bw / 2;
  var by = this.h - 42;
  ctx.fillStyle = '#666';
  ctx.fillRect(bx, by, bw, bh);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('\u8ba4\u8f93', bx + bw / 2, by + bh / 2 + 1);
  return [{ x: bx, y: by, w: bw, h: bh, id: 'resign' }];
};

Renderer.prototype.drawPromotion = function(color) {
  var ctx = this.ctx;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, this.w, this.h);
  ctx.font = '20px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('\u9009\u62e9\u5347\u53d8\u68cb\u5b50', this.w / 2, this.h / 2 - 80);

  var pieces = ['queen','rook','bishop','knight'];
  var syms = { queen: '\u265B', rook: '\u265C', bishop: '\u265D', knight: '\u265E' };
  var bw = 60, bh = 70;
  var sx = this.w / 2 - (pieces.length * (bw + 10)) / 2;
  var btns = [];
  for (var i = 0; i < pieces.length; i++) {
    var x = sx + i * (bw + 10);
    var y = this.h / 2 - 35;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    ctx.font = '36px serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(syms[pieces[i]], x + bw / 2, y + bh / 2 + 5);
    btns.push({ x: x, y: y, w: bw, h: bh, piece: pieces[i] });
  }
  return btns;
};

module.exports = Renderer;
