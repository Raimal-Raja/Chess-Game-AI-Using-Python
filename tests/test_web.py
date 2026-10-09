import chess
import pytest
from fastapi.testclient import TestClient
from web.app import app, choose_move, state
client = TestClient(app)

def request(path, moves=None, **extra):
    return client.post('/api/' + path, json={'moves': moves or [], **extra})

def test_initial_position_and_health():
    assert client.get('/health').status_code == 200
    assert client.get('/').status_code == 200
    s = request('state').json()
    assert len(s['pieces']) == 32 and len(s['legal_moves']) == 20

@pytest.mark.parametrize('move', ['e2e5', 'e7e5', 'a1a8', 'bad!'])
def test_illegal_moves_rejected(move):
    assert request('move', move=move).status_code == 400

def test_both_users_and_isolation():
    s = request('move', move='e2e4').json()
    assert s['turn'] == 'black'
    s = request('move', s['moves'], move='e7e5').json()
    assert s['turn'] == 'white' and s['history'] == ['e4', 'e5']
    assert request('state').json()['history'] == []
    assert request('state', ['e2e5']).status_code == 400

@pytest.mark.parametrize('level', [1, 2, 3])
@pytest.mark.parametrize('moves', [[], ['e2e4']])
def test_ai_both_colors(level, moves):
    board = chess.Board()
    for m in moves: board.push_uci(m)
    result = request('ai', moves, level=level)
    assert result.status_code == 200
    chosen = chess.Move.from_uci(result.json()['moves'][-1])
    assert chosen in board.legal_moves

def test_castling_and_en_passant_through_api():
    moves = ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6']
    result = request('move', moves, move='e1g1').json()
    assert result['pieces']['g1'] == 'K' and result['pieces']['f1'] == 'R'
    moves = ['e2e4','a7a6','e4e5','d7d5']
    result = request('move', moves, move='e5d6').json()
    assert result['pieces']['d6'] == 'P' and 'd5' not in result['pieces']

@pytest.mark.parametrize('piece', ['q','r','b','n'])
def test_promotion_through_api(piece):
    moves=['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2']
    result=request('move',moves,move='b7a8'+piece)
    assert result.status_code == 200
    assert result.json()['pieces']['a8'] == piece.upper()

@pytest.mark.parametrize('fen, expected', [
 ('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1','stalemate'),
 ('7k/8/6K1/8/8/8/8/8 w - - 0 1','insufficient material'),
 ('7k/8/8/8/8/8/R7/K7 w - - 100 51','fifty moves')])
def test_terminal_states(fen, expected):
    s=state(chess.Board(fen))
    assert s['game_over'] and expected in s['status'] and s['legal_moves'] == []

def test_checkmate_and_no_further_play():
    moves=['f2f3','e7e5','g2g4','d8h4']
    s=request('state',moves).json()
    assert s['game_over'] and 'Black wins' in s['status']
    assert request('move',moves,move='a2a3').status_code == 400
    assert request('ai',moves,level=2).json()['moves'] == moves

def test_threefold_repetition():
    moves=['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1']
    assert 'threefold repetition' in request('state',moves).json()['status']

@pytest.mark.parametrize('fen', ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1','3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1'])
def test_ai_finds_mate_for_both_colors(fen):
    board=chess.Board(fen); original=board.fen()
    move=choose_move(board,2)
    assert board.fen() == original
    board.push(move)
    assert board.is_checkmate()

def test_ai_game_and_export():
    board=chess.Board()
    for _ in range(40):
        if board.is_game_over(claim_draw=True): break
        move=choose_move(board,2)
        assert move in board.legal_moves
        board.push(move)
    assert '[Event' in state(board)['pgn']

def test_invalid_difficulty():
    assert request('ai',level=9).status_code == 422

def test_piece_assets_and_captured_pieces():
    assert client.get('/pieces/white_king.png').status_code == 200
    s=request('move',['e2e4','d7d5'],move='e4d5').json()
    assert s['captures']['white'] == ['p']
    s=request('move',['e2e4','a7a6','e4e5','d7d5'],move='e5d6').json()
    assert s['captures']['white'] == ['p']
