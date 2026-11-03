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
  this.castling = { wK: true, wQ: true, bK: true, bQ: true };
  this.enPassant = null;
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
      if (this.canMove(fr, fc, tr, tc) && !this.moveLeavesKingInCheck(fr, fc, tr, tc)) {
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
  if (target && target.type === 'king') return false;
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
      else if (!target && this.enPassant && this.enPassant.r === tr && this.enPassant.c === tc) {
        var epPawn = this.get(fr, tc);
        if (epPawn && epPawn.type === 'pawn' && epPawn.color !== piece.color) ok = true;
      }
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
    if (!ok && dr === 0 && ac === 2 && !target && this.castling) {
      var homeRow = piece.color === 'white' ? 7 : 0;
      var opp = piece.color === 'white' ? 'black' : 'white';
      if (fr === homeRow && fc === 4 && tr === homeRow && !this.isSquareAttacked(this.cells, homeRow, 4, opp)) {
        if (tc === 6 && this.castling[piece.color === 'white' ? 'wK' : 'bK']) {
          var kRook = this.get(homeRow, 7);
          if (kRook && kRook.type === 'rook' && kRook.color === piece.color &&
              !this.get(homeRow, 5) && !this.get(homeRow, 6) &&
              !this.isSquareAttacked(this.cells, homeRow, 5, opp) &&
              !this.isSquareAttacked(this.cells, homeRow, 6, opp)) {
            ok = true;
          }
        } else if (tc === 2 && this.castling[piece.color === 'white' ? 'wQ' : 'bQ']) {
          var qRook = this.get(homeRow, 0);
          if (qRook && qRook.type === 'rook' && qRook.color === piece.color &&
              !this.get(homeRow, 1) && !this.get(homeRow, 2) && !this.get(homeRow, 3) &&
              !this.isSquareAttacked(this.cells, homeRow, 3, opp) &&
              !this.isSquareAttacked(this.cells, homeRow, 2, opp)) {
            ok = true;
          }
        }
      }
    }
  }
  return ok;
};

ChessBoard.prototype.moveLeavesKingInCheck = function(fr, fc, tr, tc) {
  var color = this.cells[fr][fc].color;
  var simulated = [];
  var r, c;
  for (r = 0; r < 8; r++) {
    simulated[r] = [];
    for (c = 0; c < 8; c++) {
      var piece = this.cells[r][c];
      simulated[r][c] = piece ? { type: piece.type, color: piece.color } : null;
    }
  }
  var moving = simulated[fr][fc];
  if (moving && moving.type === 'pawn' && fc !== tc && !this.cells[tr][tc]) {
    simulated[fr][tc] = null;
  }
  if (moving && moving.type === 'king' && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      simulated[fr][5] = simulated[fr][7];
      simulated[fr][7] = null;
    } else if (tc === 2) {
      simulated[fr][3] = simulated[fr][0];
      simulated[fr][0] = null;
    }
  }
  simulated[tr][tc] = moving;
  simulated[fr][fc] = null;
  return this.isInCheck(simulated, color);
};

ChessBoard.prototype.isInCheck = function(cells, color) {
  var king = null;
  var r, c;
  for (r = 0; r < 8; r++) {
    for (c = 0; c < 8; c++) {
      if (cells[r][c] && cells[r][c].type === 'king' && cells[r][c].color === color) {
        king = { r: r, c: c };
        break;
      }
    }
    if (king) break;
  }
  if (!king) return false;
  return this.isSquareAttacked(cells, king.r, king.c, color === 'white' ? 'black' : 'white');
};

ChessBoard.prototype.isSquareAttacked = function(cells, r, c, byColor) {
  var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  var i, d, nr, nc, piece, distance;
  for (i = 0; i < dirs.length; i++) {
    d = dirs[i];
    nr = r + d[0];
    nc = c + d[1];
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      piece = cells[nr][nc];
      if (piece) {
        distance = Math.max(Math.abs(nr - r), Math.abs(nc - c));
        if (piece.color === byColor) {
          if (piece.type === 'king' && distance === 1) return true;
          if (piece.type === 'queen') return true;
          if (piece.type === 'bishop' && d[0] !== 0 && d[1] !== 0) return true;
          if (piece.type === 'rook' && (d[0] === 0 || d[1] === 0)) return true;
        }
        break;
      }
      nr += d[0];
      nc += d[1];
    }
  }
  var knights = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (i = 0; i < knights.length; i++) {
    nr = r + knights[i][0];
    nc = c + knights[i][1];
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      piece = cells[nr][nc];
      if (piece && piece.color === byColor && piece.type === 'knight') return true;
    }
  }
  var pawnDirection = byColor === 'white' ? 1 : -1;
  for (var dc = -1; dc <= 1; dc += 2) {
    nr = r + pawnDirection;
    nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      piece = cells[nr][nc];
      if (piece && piece.color === byColor && piece.type === 'pawn') return true;
    }
  }
  return false;
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
