"""Stateless chess API. Each browser owns its move history; no shared game globals."""
from pathlib import Path
import random
import time
import chess
import chess.pgn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="Chess Studio")
ROOT = Path(__file__).parent
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')

class Position(BaseModel):
    moves: list[str] = Field(default_factory=list, max_length=600)

class MoveRequest(Position):
    move: str = Field(min_length=4, max_length=5)

class AIRequest(Position):
    level: int = Field(default=2, ge=1, le=3)

def restore(moves):
    board = chess.Board()
    for uci in moves:
        if board.is_game_over(claim_draw=True):
            raise HTTPException(400, 'The game has already ended.')
        try:
            board.push_uci(uci)
        except ValueError:
            raise HTTPException(400, 'Invalid or illegal move history.')
    return board

def state(board):
    outcome = board.outcome(claim_draw=True)
    if outcome:
        reason = outcome.termination.name.replace('_', ' ').lower()
        status = ('Draw' if outcome.winner is None else ('White' if outcome.winner else 'Black') + ' wins') + ' · ' + reason
    else:
        status = ('White' if board.turn else 'Black') + (' is in check' if board.is_check() else ' to move')
    replay = chess.Board()
    history = []
    for move in board.move_stack:
        history.append(replay.san(move))
        replay.push(move)
    return {'fen': board.fen(), 'turn': 'white' if board.turn else 'black',
            'pieces': {chess.square_name(s): p.symbol() for s, p in board.piece_map().items()},
            'legal_moves': [] if outcome else [m.uci() for m in board.legal_moves],
            'moves': [m.uci() for m in board.move_stack], 'history': history,
            'status': status, 'game_over': bool(outcome), 'check': board.is_check(),
            'king': chess.square_name(board.king(board.turn)),
            'pgn': str(chess.pgn.Game.from_board(board))}

VALUES = {chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 330, chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0}

def evaluate(board):
    score = 0
    for square, piece in board.piece_map().items():
        center = 7 - abs(3.5 - chess.square_file(square)) - abs(3.5 - chess.square_rank(square))
        bonus = center * 4 if piece.piece_type in (chess.KNIGHT, chess.BISHOP) else 0
        score += (VALUES[piece.piece_type] + bonus) * (1 if piece.color else -1)
    return score if board.turn else -score

class SearchTimeout(Exception):
    pass

def choose_move(board, level):
    legal = list(board.legal_moves)
    if level == 1:
        return random.choice(legal)
    deadline = time.monotonic() + (0.6 if level == 2 else 1.4)
    def search(depth, alpha, beta, ply):
        if time.monotonic() > deadline:
            raise SearchTimeout
        if board.is_checkmate():
            return -100000 + ply
        if board.is_game_over(claim_draw=True):
            return 0
        if depth == 0:
            return evaluate(board)
        best = -float('inf')
        ordered = sorted(board.legal_moves, key=lambda m: (bool(m.promotion), board.is_capture(m)), reverse=True)
        for move in ordered:
            board.push(move)
            try:
                score = -search(depth - 1, -beta, -alpha, ply + 1)
            finally:
                board.pop()
            best = max(best, score)
            alpha = max(alpha, score)
            if alpha >= beta:
                break
        return best
    best_move = legal[0]
    for depth in range(1, 3 if level == 2 else 5):
        candidate, best_score = best_move, -float('inf')
        try:
            for move in sorted(legal, key=lambda m: (m == best_move, board.is_capture(m)), reverse=True):
                board.push(move)
                try:
                    score = -search(depth - 1, -float('inf'), -best_score, 1)
                finally:
                    board.pop()
                if score > best_score:
                    candidate, best_score = move, score
        except SearchTimeout:
            break
        best_move = candidate
    return best_move

@app.get('/')
def home():
    return FileResponse(ROOT / 'static' / 'index.html')

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.post('/api/state')
def get_state(req: Position):
    return state(restore(req.moves))

@app.post('/api/move')
def move(req: MoveRequest):
    board = restore(req.moves)
    if board.is_game_over(claim_draw=True):
        raise HTTPException(400, 'The game has already ended.')
    try:
        board.push_uci(req.move)
    except ValueError:
        raise HTTPException(400, 'That move is not legal.')
    return state(board)

@app.post('/api/ai')
def ai(req: AIRequest):
    board = restore(req.moves)
    if not board.is_game_over(claim_draw=True):
        board.push(choose_move(board, req.level))
    return state(board)
