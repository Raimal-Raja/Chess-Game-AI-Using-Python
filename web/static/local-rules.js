/* Immediate, device-local rules. The Python API remains available separately. */
class BrowserGame {
  constructor(ChessClass = Chess) {
    this.chess = new ChessClass();
    this.entries = [];
  }
  restore(moves = []) {
    if (!Array.isArray(moves) || moves.length > 600) throw Error('Invalid game history.');
    const previous = this.entries.map(m => m.from + m.to + (m.promotion || ''));
    this.chess.reset();
    this.entries = [];
    try { for (const move of moves) this.move(move); }
    catch (error) {
      this.chess.reset(); this.entries = [];
      for (const move of previous) this.move(move);
      throw error;
    }
    return this.snapshot();
  }
  move(uci) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw Error('That move is not legal.');
    const move = this.chess.move({from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4]});
    this.entries.push(move);
    return move;
  }
  drawReason(legal) {
    if (this.chess.isStalemate()) return 'stalemate';
    if (this.chess.isInsufficientMaterial()) return 'insufficient material';
    if (this.chess.isThreefoldRepetition()) return 'threefold repetition';
    if (this.chess.isDrawByFiftyMoves()) return 'fifty moves';
    // Match automatic acceptance of claimable draws in the Python API,
    // including a draw claim made by declaring the next legal move.
    const positions = new Map();
    const key = fen => fen.split(' ').slice(0,4).join(' ');
    if (this.entries.length) positions.set(key(this.entries[0].before), 1);
    for (const move of this.entries) {
      const k = key(move.after); positions.set(k, (positions.get(k) || 0) + 1);
    }
    const repeatPossible = [...positions.values()].some(count => count >= 2);
    const fiftyPossible = Number(this.chess.fen().split(' ')[4]) >= 99;
    if (repeatPossible || fiftyPossible) {
      for (const move of legal) {
        this.chess.move(move);
        let reason = null;
        try {
          if (this.chess.isThreefoldRepetition()) reason = 'threefold repetition';
          else if (fiftyPossible && !this.chess.isCheckmate() && this.chess.isDrawByFiftyMoves()) reason = 'fifty moves';
        } finally { this.chess.undo(); }
        if (reason) return reason;
      }
    }
    return null;
  }
  snapshot() {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    const check = this.chess.isCheck(), mate = this.chess.isCheckmate();
    const legal = this.chess.moves({verbose: true});
    const draw = mate ? null : this.drawReason(legal);
    const over = mate || !!draw, pieces = {}, captures = {white: [], black: []};
    let king;
    for (const rank of this.chess.board()) for (const piece of rank) if (piece) {
      pieces[piece.square] = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
      if (piece.type === 'k' && piece.color === this.chess.turn()) king = piece.square;
    }
    for (const move of this.entries) if (move.captured)
      captures[move.color === 'w' ? 'white' : 'black'].push(move.color === 'w' ? move.captured : move.captured.toUpperCase());
    const status = mate ? (turn === 'white' ? 'Black' : 'White') + ' wins · checkmate' :
      draw ? 'Draw · ' + draw : (turn === 'white' ? 'White' : 'Black') + (check ? ' is in check' : ' to move');
    this.chess.setHeader('Result', mate ? (turn === 'white' ? '0-1' : '1-0') : draw ? '1/2-1/2' : '*');
    return {fen: this.chess.fen(), turn, pieces, captures, king, check, status,
      game_over: over, moves: this.entries.map(m => m.from + m.to + (m.promotion || '')),
      legal_moves: over ? [] : legal.map(m => m.from + m.to + (m.promotion || '')),
      history: this.entries.map(m => m.san), pgn: this.chess.pgn()};
  }
}
if (typeof module !== 'undefined') module.exports = {BrowserGame};
