import random
import copy
import json

from move import Move
from square import Square
from const import *
import subprocess
import shlex
import os

# Simple evaluation: sum of piece values (Piece.value stores signed values: white positive, black negative)
def evaluate(board):
    s = 0
    for r in range(ROWS):
        for c in range(COLS):
            if board.squares[r][c].has_piece():
                p = board.squares[r][c].piece
                s += p.value
    return s


def all_legal_moves(board, color):
    moves = []
    for r in range(ROWS):
        for c in range(COLS):
            if board.squares[r][c].has_piece():
                p = board.squares[r][c].piece
                if p.color == color:
                    p.clear_moves()
                    board.calc_moves(p, r, c, bool=True)
                    for m in p.moves:
                        # create move with minimal references (just rows/cols)
                        initial = Square(m.initial.row, m.initial.col)
                        final = Square(m.final.row, m.final.col)
                        moves.append(Move(initial, final))
    return moves


def random_bot(board, color):
    moves = all_legal_moves(board, color)
    if not moves:
        return None
    return random.choice(moves)


def minimax_bot(board, color, depth=2):
    """Return best Move for color using depth-limited minimax (no alpha-beta for simplicity)."""
    def minimax(node_board, d, maximizing):
        if d == 0:
            return evaluate(node_board), None

        color_to_move = color if maximizing else ('black' if color == 'white' else 'white')
        legal = all_legal_moves(node_board, color_to_move)
        if not legal:
            return evaluate(node_board), None

        best_move = None
        if maximizing:
            max_eval = -10**9
            for m in legal:
                tb = copy.deepcopy(node_board)
                piece = tb.squares[m.initial.row][m.initial.col].piece
                tb.move(piece, m)
                val, _ = minimax(tb, d-1, False)
                if val > max_eval:
                    max_eval = val
                    best_move = m
            return max_eval, best_move
        else:
            min_eval = 10**9
            for m in legal:
                tb = copy.deepcopy(node_board)
                piece = tb.squares[m.initial.row][m.initial.col].piece
                tb.move(piece, m)
                val, _ = minimax(tb, d-1, True)
                if val < min_eval:
                    min_eval = val
                    best_move = m
            return min_eval, best_move

    _, move = minimax(board, depth, True)
    return move


def deep_blue_bot(board, color, depth=4):
    """Alpha-beta minimax with a simple positional evaluation (material + piece-square tables)."""
    # piece-square tables (very small heuristic) for pawns and knights/others as example
    PST = {
        'pawn': [0, 5, 5, 0, 5, 10, 50, 0],
        'knight': [-50, -40, -30, -30, -30, -30, -40, -50],
        'bishop': [-20, -10, -10, -10, -10, -10, -10, -20],
        'rook': [0, 0, 5, 10, 10, 5, 0, 0],
        'queen': [-20, 0, 10, 20, 20, 10, 0, -20],
        'king': [20, 30, 10, 0, 0, 10, 30, 20]
    }

    def eval_board(bd):
        # base material evaluation
        val = 0
        for r in range(ROWS):
            for c in range(COLS):
                sq = bd.squares[r][c]
                if sq.has_piece():
                    p = sq.piece
                    pv = p.value
                    val += pv
                    # add small PST bonus depending on color
                    name = p.name
                    if name in PST:
                        # for white, table index is rank from white's perspective
                        idx = (7 - r) if p.color == 'white' else r
                        # Use absolute value scaled down
                        val += (PST[name][idx] / 100.0) * (1 if p.color == 'white' else -1)
        return val

    def alpha_beta(node_board, depth_left, alpha, beta, maximizing):
        # terminal or depth
        if depth_left == 0:
            return eval_board(node_board), None

        color_to_move = color if maximizing else ('black' if color == 'white' else 'white')
        legal = all_legal_moves(node_board, color_to_move)
        if not legal:
            return eval_board(node_board), None

        best_move = None
        if maximizing:
            value = -10**9
            for m in legal:
                tb = copy.deepcopy(node_board)
                piece = tb.squares[m.initial.row][m.initial.col].piece
                tb.move(piece, m)
                v, _ = alpha_beta(tb, depth_left - 1, alpha, beta, False)
                if v > value:
                    value = v
                    best_move = m
                alpha = max(alpha, value)
                if alpha >= beta:
                    break
            return value, best_move
        else:
            value = 10**9
            for m in legal:
                tb = copy.deepcopy(node_board)
                piece = tb.squares[m.initial.row][m.initial.col].piece
                tb.move(piece, m)
                v, _ = alpha_beta(tb, depth_left - 1, alpha, beta, True)
                if v < value:
                    value = v
                    best_move = m
                beta = min(beta, value)
                if alpha >= beta:
                    break
            return value, best_move

    _, move = alpha_beta(board, depth, -10**9, 10**9, True)
    return move


def find_engine_binary(name):
    """Search the engines folder for a binary containing `name` (case-insensitive).
    Return the full path or None.
    """
    engines_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'engines')
    if not os.path.isdir(engines_dir):
        return None
    for fn in os.listdir(engines_dir):
        if name.lower() in fn.lower():
            return os.path.join(engines_dir, fn)
    return None


# --- Magnus opening book support ---
_magnus_book = None
_magnus_book_path = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'magnus_book.json'))

def load_magnus_book(path=None):
    """Load the magnus opening book JSON into memory. Safe to call multiple times."""
    global _magnus_book
    if _magnus_book is not None:
        return _magnus_book
    p = path or _magnus_book_path
    if not os.path.exists(p):
        _magnus_book = None
        return None
    try:
        # Load raw book then normalize keys to our internal simplified FEN so
        # that castling/en-passant differences don't prevent matches.
        import magnus_book as _mb
        with open(p, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        normalized = {}
        for fen, moves in raw.items():
            try:
                key = _mb.simplify_fen(fen)
            except Exception:
                key = fen
            # merge counts if multiple raw keys collapse to the same normalized key
            if key not in normalized:
                normalized[key] = moves.copy()
            else:
                for uci, cnt in moves.items():
                    normalized[key][uci] = normalized[key].get(uci, 0) + cnt
        _magnus_book = normalized
        return _magnus_book
    except Exception:
        _magnus_book = None
        return None


def move_to_uci(move):
    """Convert internal Move object to a UCI string like 'e2e4'."""
    try:
        c1 = move.initial.col
        r1 = move.initial.row
        c2 = move.final.col
        r2 = move.final.row
        file_from = chr(ord('a') + c1)
        rank_from = str(8 - r1)
        file_to = chr(ord('a') + c2)
        rank_to = str(8 - r2)
        return f"{file_from}{rank_from}{file_to}{rank_to}"
    except Exception:
        return None


def magnus_bot(board, color, randomness=0.0):
    """Try to pick a move from Magnus Carlsen PGN book.

    Returns a Move or None if no book move available.
    randomness: 0.0 picks most frequent move, >0.0 does weighted sampling.
    """
    book = load_magnus_book()
    if not book:
        return None
    fen = board_to_fen(board, color_to_move=color)
    if fen is None:
        return None
    # book keys use the same normalized FEN shape as board_to_fen
    moves_dict = book.get(fen)
    if not moves_dict:
        return None

    # build set of legal UCIs from our legal move generator
    legal_moves = all_legal_moves(board, color)
    legal_ucis = set()
    for m in legal_moves:
        u = move_to_uci(m)
        if u:
            legal_ucis.add(u)

    entries = [(uci, cnt) for uci, cnt in moves_dict.items() if uci in legal_ucis]
    if not entries:
        return None

    if randomness <= 0.0:
        entries.sort(key=lambda x: x[1], reverse=True)
        chosen_uci = entries[0][0]
    else:
        ucis, counts = zip(*entries)
        total = sum(counts)
        weights = [c/total for c in counts]
        adjusted = [((1-randomness) * w + randomness * (1/len(weights))) for w in weights]
        chosen_uci = random.choices(ucis, weights=adjusted, k=1)[0]

    return uci_to_move(chosen_uci)


# unify API
def get_bot_move(board, color, engine='random', depth=2):
    # magnus book selection: try book first then fall back
    if engine == 'magnus':
        try:
            m = magnus_bot(board, color, randomness=0.0)
            if m:
                return m
        except Exception:
            pass
        # fallback chain: deepblue -> stockfish -> random
        m = deep_blue_bot(board, color, depth=2)
        if m:
            return m
        try:
            return get_bot_move(board, color, engine='stockfish', depth=depth)
        except Exception:
            return random_bot(board, color)
    if engine == 'random':
        return random_bot(board, color)
    elif engine == 'minimax':
        return minimax_bot(board, color, depth=depth)
    elif engine == 'deepblue' or engine == 'deep_blue':
        return deep_blue_bot(board, color, depth=depth)
    elif engine == 'stockfish':
        # Try to use python-chess if available, otherwise try calling stockfish directly via subprocess.
        try:
            import chess
            import chess.engine
        except Exception:
            # python-chess not available; try subprocess UCI call (best-effort)
            engines_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'engines')
            default_path = os.path.join(engines_dir, 'stockfish-windows-x86-64-avx2')
            if not os.path.exists(default_path):
                default_path = os.path.join(engines_dir, 'stockfish.exe')
            path = os.environ.get('STOCKFISH_PATH', default_path)
            # We need FEN from our board
            fen = board_to_fen(board, color_to_move=color)
            if fen is None:
                return None
            try:
                # start stockfish process
                p = subprocess.Popen([path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                # send commands
                p.stdin.write(f'position fen {fen}\n')
                p.stdin.write(f'go depth {depth}\n')
                p.stdin.flush()
                # read until bestmove
                best = None
                while True:
                    line = p.stdout.readline()
                    if not line:
                        break
                    if line.startswith('bestmove'):
                        parts = line.split()
                        if len(parts) >= 2:
                            best = parts[1]
                        break
                p.stdin.write('quit\n')
                p.stdin.flush()
                p.terminate()
                if best:
                    return uci_to_move(best)
            except Exception:
                return None

        # using python-chess
        try:
            import chess
            import chess.engine
            engines_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'engines')
            default_path = os.path.join(engines_dir, 'stockfish-windows-x86-64-avx2')
            if not os.path.exists(default_path):
                default_path = os.path.join(engines_dir, 'stockfish.exe')
            path = os.environ.get('STOCKFISH_PATH', default_path)
            engine_proc = chess.engine.SimpleEngine.popen_uci(path)
            fen = board_to_fen(board, color_to_move=color)
            if fen is None:
                engine_proc.quit()
                return None
            cb = chess.Board(fen)
            # Limit both time and depth for more human-like play
            limit = chess.engine.Limit(time=0.5, depth=depth)
            res = engine_proc.play(cb, limit)
            engine_proc.quit()
            if res and res.move:
                return uci_to_move(res.move.uci())
        except Exception:
            return None
    elif engine == 'komodo':
        # Try python-chess engine interface first
        try:
            import chess
            import chess.engine
            # allow env override, otherwise try to discover a komodo binary in engines/
            path = os.environ.get('KOMODO_PATH')
            if not path:
                # try common Komodo names, some distributions are named 'dragon-64bit...' etc.
                path = find_engine_binary('komodo') or find_engine_binary('dragon')
            if not path:
                return None
            engine_proc = chess.engine.SimpleEngine.popen_uci(path)
            fen = board_to_fen(board, color_to_move=color)
            if fen is None:
                engine_proc.quit()
                return None
            cb = chess.Board(fen)
            limit = chess.engine.Limit(time=0.75, depth=depth)
            res = engine_proc.play(cb, limit)
            engine_proc.quit()
            if res and res.move:
                return uci_to_move(res.move.uci())
        except Exception:
            # fallback: direct subprocess UCI
            path = os.environ.get('KOMODO_PATH', find_engine_binary('komodo') or find_engine_binary('dragon') or 'komodo')
            fen = board_to_fen(board, color_to_move=color)
            if fen is None:
                return None
            try:
                p = subprocess.Popen([path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                p.stdin.write(f'position fen {fen}\n')
                p.stdin.write(f'go depth {depth}\n')
                p.stdin.flush()
                best = None
                while True:
                    line = p.stdout.readline()
                    if not line:
                        break
                    if line.startswith('bestmove'):
                        parts = line.split()
                        if len(parts) >= 2:
                            best = parts[1]
                        break
                p.stdin.write('quit\n')
                p.stdin.flush()
                p.terminate()
                if best:
                    return uci_to_move(best)
            except Exception:
                return None
    else:
        # unknown engine
        return None


def board_to_fen(board, color_to_move='white'):
    """Convert the internal board representation to a FEN string (best-effort).

    Note: castling rights and en-passant are set to '-' (unknown). Halfmove/fullmove set to 0/1.
    """
    try:
        rows = []
        for r in range(ROWS):
            fen_rank = ''
            empty = 0
            for c in range(COLS):
                sq = board.squares[r][c]
                if sq.has_piece():
                    if empty > 0:
                        fen_rank += str(empty)
                        empty = 0
                    p = sq.piece
                    ch = 'p'
                    if p.name == 'pawn': ch = 'p'
                    elif p.name == 'knight': ch = 'n'
                    elif p.name == 'bishop': ch = 'b'
                    elif p.name == 'rook': ch = 'r'
                    elif p.name == 'queen': ch = 'q'
                    elif p.name == 'king': ch = 'k'
                    if p.color == 'white': ch = ch.upper()
                    fen_rank += ch
                else:
                    empty += 1
            if empty > 0:
                fen_rank += str(empty)
            rows.append(fen_rank)

        # our rows are 0..7 top-to-bottom; FEN expects ranks 8..1 left-to-right so join in that order
        fen_board = '/'.join(rows)
        # active color
        active = 'w' if color_to_move == 'white' else 'b'
        # minimal FEN: no castling info
        fen = f"{fen_board} {active} - - 0 1"
        return fen
    except Exception:
        return None


def uci_to_move(uci):
    """Convert UCI string like 'e2e4' or 'e7e8q' to Move object from our move.py."""
    try:
        u = uci.strip()
        if len(u) < 4:
            return None
        file_from = ord(u[0]) - ord('a')
        rank_from = int(u[1])
        file_to = ord(u[2]) - ord('a')
        rank_to = int(u[3])
        initial_row = 8 - rank_from
        initial_col = file_from
        final_row = 8 - rank_to
        final_col = file_to
        return Move(Square(initial_row, initial_col), Square(final_row, final_col))
    except Exception:
        return None
