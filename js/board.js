var BOARD_SYMBOLS = {
  white: { king: '\u2654', queen: '\u2655', rook: '\u2656', bishop: '\u2657', knight: '\u2658', pawn: '\u2659' },
  black: { king: '\u265A', queen: '\u265B', rook: '\u265C', bishop: '\u265D', knight: '\u265E', pawn: '\u265F' }
};

function ChessBoard() {
  this.cells = [];
  this.selected = null;
  this.validMoves = [];
  this.turn = 'white';
  this.myColor = null;
  this.inCheck = false;
  this.lastMove = null;
  this.init();
}

ChessBoard.prototype.init = function() {
  var r, c;
  for (r = 0; r < 8; r++) {
    this.cells[r] = [];
    for (c = 0; c < 8; c++) {
      this.cells[r][c] = null;
    }
  }
  var back = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for (c = 0; c < 8; c++) {
    this.cells[0][c] = { type: back[c], color: 'black' };
    this.cells[1][c] = { type: 'pawn', color: 'black' };
    this.cells[6][c] = { type: 'pawn', color: 'white' };
    this.cells[7][c] = { type: back[c], color: 'white' };
  }
};

ChessBoard.prototype.setBoard = function(data) {
  this.cells = data;
};

ChessBoard.prototype.get = function(r, c) {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return this.cells[r][c];
};

ChessBoard.prototype.canSelect = function(r, c) {
  if (this.turn !== this.myColor) return false;
  var p = this.get(r, c);
  return p && p.color === this.myColor;
};

ChessBoard.prototype.select = function(r, c) {
  if (!this.canSelect(r, c)) return false;
  this.selected = { r: r, c: c };
  this.validMoves = this.calcMoves(r, c);
  return true;
};

ChessBoard.prototype.deselect = function() {
  this.selected = null;
  this.validMoves = [];
};

ChessBoard.prototype.isValidTarget = function(r, c) {
  for (var i = 0; i < this.validMoves.length; i++) {
    if (this.validMoves[i].r === r && this.validMoves[i].c === c) return true;
  }
  return false;
};

ChessBoard.prototype.calcMoves = function(fr, fc) {
  var piece = this.get(fr, fc);
  if (!piece) return [];
  var moves = [];
  var tr, tc;
  for (tr = 0; tr < 8; tr++) {
    for (tc = 0; tc < 8; tc++) {
      if (fr === tr && fc === tc) continue;
      if (this.canMove(fr, fc, tr, tc)) {
        moves.push({ r: tr, c: tc });
      }
    }
  }
  return moves;
};

ChessBoard.prototype.canMove = function(fr, fc, tr, tc) {
  var piece = this.get(fr, fc);
  if (!piece) return false;
  var target = this.get(tr, tc);
  if (target && target.color === piece.color) return false;

  var dr = tr - fr;
  var dc = tc - fc;
  var ar = Math.abs(dr);
  var ac = Math.abs(dc);
  var ok = false;

  if (piece.type === 'pawn') {
    var dir = piece.color === 'white' ? -1 : 1;
    var start = piece.color === 'white' ? 6 : 1;
    if (dc === 0) {
      if (dr === dir && !target) ok = true;
      if (dr === dir * 2 && fr === start && !target && !this.get(fr + dir, fc)) ok = true;
    } else if (ac === 1 && dr === dir) {
      if (target && target.color !== piece.color) ok = true;
    }
  } else if (piece.type === 'rook') {
    ok = (dr === 0 || dc === 0) && (ar + ac > 0);
    if (ok) ok = this.pathClear(fr, fc, tr, tc);
  } else if (piece.type === 'knight') {
    ok = (ar === 2 && ac === 1) || (ar === 1 && ac === 2);
  } else if (piece.type === 'bishop') {
    ok = ar === ac && ar > 0;
    if (ok) ok = this.pathClear(fr, fc, tr, tc);
  } else if (piece.type === 'queen') {
    ok = (dr === 0 || dc === 0 || ar === ac) && (ar + ac > 0);
    if (ok) ok = this.pathClear(fr, fc, tr, tc);
  } else if (piece.type === 'king') {
    ok = ar <= 1 && ac <= 1 && (ar + ac > 0);
  }
  return ok;
};

ChessBoard.prototype.pathClear = function(fr, fc, tr, tc) {
  var sr = Math.sign(tr - fr);
  var sc = Math.sign(tc - fc);
  var r = fr + sr;
  var c = fc + sc;
  while (r !== tr || c !== tc) {
    if (this.get(r, c)) return false;
    r += sr;
    c += sc;
  }
  return true;
};

module.exports = ChessBoard;
