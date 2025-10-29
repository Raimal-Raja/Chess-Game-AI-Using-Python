import os
import json
try:
    import chess.pgn
except Exception:
    chess = None


def simplify_fen(fen: str) -> str:
    """Normalize FEN for book keys: keep placement, active color, castling and en-passant,
    but zero out halfmove/fullmove counters to increase transposition hits.
    """
    parts = fen.split()
    if len(parts) < 6:
        return fen
    # normalize: remove castling and en-passant to match internal board_to_fen
    parts[2] = '-'
    parts[3] = '-'
    parts[4] = '0'
    parts[5] = '1'
    return ' '.join(parts[:6])


def build_book(pgn_path: str, out_path: str):
    """Build a JSON opening book from a PGN file.

    pgn_path: path to magnus.pgn
    out_path: path to write JSON mapping {fen: {uci: count}}
    """
    if chess is None:
        raise RuntimeError('python-chess is required to build the book: pip install python-chess')

    counts = {}
    with open(pgn_path, 'r', encoding='utf-8', errors='ignore') as f:
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break
            board = game.board()
            for move in game.mainline_moves():
                fen = simplify_fen(board.fen())
                uci = move.uci()
                counts.setdefault(fen, {})
                counts[fen][uci] = counts[fen].get(uci, 0) + 1
                board.push(move)

    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as out:
        json.dump(counts, out)
    return out_path


def load_book(path: str):
    """Load the JSON book produced by build_book. Returns dict or None if not present."""
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
