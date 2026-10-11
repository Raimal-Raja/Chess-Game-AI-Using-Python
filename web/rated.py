"""Persistent, server-authoritative rated games. Supabase handles account passwords."""
from datetime import datetime, timezone
from functools import lru_cache
import base64
import hashlib
from urllib.parse import urlencode
from fastapi.responses import RedirectResponse
import math
import os
import secrets
from uuid import UUID

import chess
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, Float, Integer, MetaData, String, create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

router = APIRouter(prefix='/rated', tags=['Rated chess'])

class Base(DeclarativeBase):
    metadata = MetaData(schema='chess')

class Player(Base):
    __tablename__ = 'players'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    rating: Mapped[int] = mapped_column(Integer, default=1200)
    games: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    current_match: Mapped[str | None] = mapped_column(String(12), nullable=True)

class Match(Base):
    __tablename__ = 'matches'
    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    white_id: Mapped[str] = mapped_column(String(36), index=True)
    black_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default='waiting')
    moves: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    white_rating: Mapped[int] = mapped_column(Integer)
    black_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    white_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    white_seconds: Mapped[float] = mapped_column(Float, default=600)
    black_seconds: Mapped[float] = mapped_column(Float, default=600)
    clock_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def now():
    return datetime.now(timezone.utc)


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def configured():
    return all(os.getenv(key) for key in ('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL', 'SITE_URL'))


@lru_cache(maxsize=2)
def database(url):
    parsed = make_url(url)
    if parsed.drivername.startswith('sqlite'):
        if os.getenv('RENDER'):
            raise HTTPException(503, 'Rated play needs persistent PostgreSQL on Render.')
        options = {'connect_args': {'check_same_thread': False}}
        if parsed.database in (None, '', ':memory:'):
            options['poolclass'] = StaticPool
        engine = create_engine(parsed, **options).execution_options(schema_translate_map={'chess': None})
    else:
        parsed = parsed.set(drivername='postgresql+psycopg').update_query_dict({'sslmode': 'require'})
        engine = create_engine(parsed, pool_pre_ping=True, pool_size=2, max_overflow=1,
                               connect_args={'prepare_threshold': None, 'connect_timeout': 10})
        with engine.begin() as connection:
            connection.execute(text('CREATE SCHEMA IF NOT EXISTS chess'))
            connection.execute(text('REVOKE ALL ON SCHEMA chess FROM PUBLIC'))
    Base.metadata.create_all(engine)
    if engine.dialect.name == 'postgresql':
        with engine.begin() as connection:
            for table in ('players', 'matches'):
                connection.execute(text(f'ALTER TABLE chess.{table} ENABLE ROW LEVEL SECURITY'))
    return engine


def db_session():
    url = os.getenv('DATABASE_URL')
    if not url:
        raise HTTPException(503, 'Rated play is not configured yet.')
    try:
        with Session(database(url)) as session:
            with session.begin():
                yield session
    except SQLAlchemyError:
        raise HTTPException(503, 'The rated-game database is unavailable. Please retry.') from None


def auth_request(path, *, method='POST', payload=None, token=None):
    base = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY')
    if not base or not key:
        raise HTTPException(503, 'Player accounts are not configured yet.')
    headers = {'apikey': key}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    try:
        response = httpx.request(method, base + '/auth/v1/' + path, json=payload,
                                 headers=headers, timeout=15)
        data = response.json() if response.content else {}
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'Account service unavailable. Please retry.') from None
    if not response.is_success:
        if response.status_code == 429:
            raise HTTPException(429, 'Too many account requests. Please wait and retry.')
        if method == 'GET' or path.startswith('token'):
            raise HTTPException(401, 'Sign in again or check your email and password.')
        raise HTTPException(400, 'Account request failed. Check your details or confirmation email.')
    return data


def identity(request: Request):
    token = request.cookies.get('chess_access')
    if not token:
        raise HTTPException(401, 'Sign in to play rated matches.')
    user = auth_request('user', method='GET', token=token)
    try:
        user_id = str(UUID(user['id']))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(401, 'Invalid account session.') from None
    metadata = user.get('user_metadata') or {}
    name = str(metadata.get('display_name') or metadata.get('full_name') or metadata.get('user_name') or 'Chess player').strip()[:40]
    return {'id': user_id, 'name': name or 'Chess player'}


def same_origin(request: Request):
    origin = request.headers.get('origin')
    allowed = {str(request.base_url).rstrip('/'), os.getenv('SITE_URL', '').rstrip('/')}
    if origin and origin.rstrip('/') not in allowed:
        raise HTTPException(403, 'This request must come from Chess Studio.')


def cookies(response: Response, data):
    secure = os.getenv('SITE_URL', '').startswith('https://') or bool(os.getenv('RENDER'))
    response.set_cookie('chess_access', data['access_token'], httponly=True, secure=secure,
                        samesite='lax', max_age=int(data.get('expires_in', 3600)), path='/')
    response.set_cookie('chess_refresh', data['refresh_token'], httponly=True, secure=secure,
                        samesite='lax', max_age=30 * 86400, path='/rated/auth')


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default='Chess player', min_length=2, max_length=40)


@router.get('/config')
def config():
    return {'enabled': configured(), 'github_enabled': os.getenv('SUPABASE_GITHUB_AUTH') == 'true', 'rating_name': 'Chess Studio Elo', 'initial_rating': 1200,
            'k_factor': 32, 'clock_seconds': 600}


@router.get('/auth/github')
def github_login():
    if not configured() or os.getenv('SUPABASE_GITHUB_AUTH') != 'true':
        raise HTTPException(503, 'GitHub sign-in is not configured yet.')
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    params = urlencode({'provider': 'github', 'redirect_to': os.environ['SITE_URL'].rstrip('/') + '/rated/auth/callback',
                        'code_challenge': challenge, 'code_challenge_method': 's256'})
    response = RedirectResponse(os.environ['SUPABASE_URL'].rstrip('/') + '/auth/v1/authorize?' + params)
    response.set_cookie('chess_verifier', verifier, httponly=True, samesite='lax', max_age=600,
                        secure=os.environ['SITE_URL'].startswith('https://'), path='/rated/auth')
    return response


@router.get('/auth/callback')
def github_callback(request: Request, code: str = ''):
    verifier = request.cookies.get('chess_verifier')
    target = os.getenv('SITE_URL', '').rstrip('/')
    if not target or not verifier or not code or len(code) > 2048:
        raise HTTPException(400, 'Sign-in expired. Start GitHub sign-in again.')
    response = RedirectResponse(target, status_code=303)
    try:
        result = auth_request('token?grant_type=pkce', payload={'auth_code': code, 'code_verifier': verifier})
        cookies(response, result)
    except HTTPException:
        response = RedirectResponse(target + '/?auth_error=signin', status_code=303)
    response.delete_cookie('chess_verifier', path='/rated/auth')
    return response


@router.post('/auth/signup', dependencies=[Depends(same_origin)])
def signup(req: Credentials, response: Response):
    if '@' not in req.email:
        raise HTTPException(400, 'Enter a valid email address.')
    result = auth_request('signup', payload={'email': req.email, 'password': req.password,
                          'data': {'display_name': req.name.strip()}})
    if result.get('access_token'):
        cookies(response, result)
        return {'signed_in': True}
    return {'signed_in': False, 'message': 'Check your email to confirm your account, then sign in.'}


@router.post('/auth/login', dependencies=[Depends(same_origin)])
def login(req: Credentials, response: Response):
    result = auth_request('token?grant_type=password', payload={'email': req.email, 'password': req.password})
    cookies(response, result)
    return {'signed_in': True}


@router.post('/auth/refresh', dependencies=[Depends(same_origin)])
def refresh(request: Request, response: Response):
    token = request.cookies.get('chess_refresh')
    if not token:
        raise HTTPException(401, 'Sign in again.')
    result = auth_request('token?grant_type=refresh_token', payload={'refresh_token': token})
    cookies(response, result)
    return {'signed_in': True}


@router.post('/auth/logout', dependencies=[Depends(same_origin)])
def logout(request: Request, response: Response):
    if request.cookies.get('chess_access'):
        try: auth_request('logout?scope=local', token=request.cookies['chess_access'])
        except HTTPException: pass
    response.delete_cookie('chess_access', path='/')
    response.delete_cookie('chess_refresh', path='/rated/auth')
    return {'signed_out': True}


def player(session, user, lock=False):
    # Insert once, without overwriting an existing rating or racing another login.
    if session.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    session.execute(insert(Player).values(id=user['id'], name=user['name'], rating=1200,
                    games=0, wins=0, losses=0, draws=0).on_conflict_do_nothing(index_elements=['id']))
    query = select(Player).where(Player.id == user['id'])
    if lock:
        query = query.with_for_update()
    return session.scalar(query)


def profile(p):
    return {'id': p.id, 'name': p.name, 'rating': p.rating, 'games': p.games,
            'wins': p.wins, 'losses': p.losses, 'draws': p.draws, 'current_match': p.current_match,
            'provisional': p.games < 20}


@router.get('/me')
def me(user=Depends(identity), session=Depends(db_session)):
    return profile(player(session, user))


@router.get('/leaderboard')
def leaderboard(user=Depends(identity), session=Depends(db_session)):
    rows = session.scalars(select(Player).where(Player.games > 0).order_by(Player.rating.desc(), Player.id).limit(20))
    return [profile(p) for p in rows]


def require_match(session, code, user, participant=True):
    match = session.scalar(select(Match).where(Match.id == code).with_for_update())
    if not match:
        raise HTTPException(404, 'Match not found. Check the invitation code.')
    if participant and user['id'] not in (match.white_id, match.black_id):
        raise HTTPException(403, 'This match belongs to other players.')
    return match


def board_for(match):
    board = chess.Board()
    for move in match.moves:
        board.push_uci(move)
    return board


def finish(session, match, result, reason):
    if match.status != 'active':
        return
    ids = sorted([match.white_id, match.black_id])
    players = {p.id: p for p in session.scalars(select(Player).where(Player.id.in_(ids)).order_by(Player.id).with_for_update())}
    white, black = players[match.white_id], players[match.black_id]
    score = {'1-0': 1, '0-1': 0, '1/2-1/2': .5}[result]
    expected = 1 / (1 + 10 ** ((black.rating - white.rating) / 400))
    # One rounded delta, applied with opposite signs: ratings remain zero-sum.
    delta = math.floor(32 * (score - expected) + .5)
    white.rating += delta
    black.rating -= delta
    for p, value in ((white, score), (black, 1 - score)):
        p.games += 1
        if value == 1: p.wins += 1
        elif value == 0: p.losses += 1
        else: p.draws += 1
        p.current_match = None
    match.white_seconds, match.black_seconds = remaining(match, board_for(match))
    match.clock_at = None
    match.status = 'finished'
    match.result = result
    match.reason = reason
    match.white_delta = delta
    match.finished_at = now()


def remaining(match, board):
    white, black = match.white_seconds, match.black_seconds
    if match.status == 'active' and match.clock_at:
        elapsed = max(0, (now() - aware(match.clock_at)).total_seconds())
        if board.turn: white -= elapsed
        else: black -= elapsed
    return max(0, white), max(0, black)


def settle_clock(session, match, board):
    if match.status != 'active': return
    white, black = remaining(match, board)
    if (white if board.turn else black) <= 0:
        result = '1/2-1/2' if board.has_insufficient_material(not board.turn) else ('0-1' if board.turn else '1-0')
        finish(session, match, result, 'time expired')


def snapshot(session, match, user):
    from web.app import state
    board = board_for(match)
    settle_clock(session, match, board)
    s = state(board)
    if match.status == 'waiting':
        s['status'] = 'Waiting for another player'
        s['legal_moves'] = []
    elif match.status == 'cancelled':
        s.update(status='Invitation cancelled', game_over=True, legal_moves=[])
    elif match.status == 'finished':
        label = {'1-0': 'White wins', '0-1': 'Black wins', '1/2-1/2': 'Draw'}[match.result]
        s.update(status=label + ' · ' + match.reason, game_over=True, legal_moves=[])
    white, black = remaining(match, board)
    white_player = session.get(Player, match.white_id)
    black_player = session.get(Player, match.black_id) if match.black_id else None
    game = chess.pgn.Game.from_board(board)
    game.headers.update({'Event': 'Chess Studio rated', 'White': white_player.name,
                         'Black': black_player.name if black_player else '?',
                         'WhiteElo': str(match.white_rating), 'BlackElo': str(match.black_rating or '?'),
                         'Result': match.result or '*', 'TimeControl': '600'})
    s['pgn'] = str(game)
    return {'id': match.id, 'status': match.status, 'result': match.result, 'reason': match.reason,
            'side': 'white' if user['id'] == match.white_id else 'black', 'state': s,
            'white': profile(white_player), 'black': profile(black_player) if black_player else None,
            'white_delta': match.white_delta, 'white_seconds': white, 'black_seconds': black,
            'clock_turn': s['turn'], 'server_time': now().isoformat()}


@router.post('/matches', dependencies=[Depends(same_origin)])
def create_match(user=Depends(identity), session=Depends(db_session)):
    p = player(session, user, lock=True)
    if p.current_match:
        raise HTTPException(409, 'Finish, resign or cancel your current match first.')
    code = secrets.token_hex(6)
    match = Match(id=code, white_id=p.id, white_rating=p.rating, status='waiting', moves=[],
                  created_at=now(), white_seconds=600, black_seconds=600)
    session.add(match)
    p.current_match = code
    session.flush()
    return snapshot(session, match, user)


@router.post('/matches/{code}/join', dependencies=[Depends(same_origin)])
def join_match(code: str, user=Depends(identity), session=Depends(db_session)):
    match = require_match(session, code, user, participant=False)
    if match.status != 'waiting':
        raise HTTPException(409, 'This invitation is no longer open.')
    if match.white_id == user['id']:
        raise HTTPException(400, 'A different account must join your match.')
    p = player(session, user, lock=True)
    if p.current_match:
        raise HTTPException(409, 'Finish, resign or cancel your current match first.')
    match.black_id = p.id
    match.black_rating = p.rating
    match.status = 'active'
    match.clock_at = now()
    p.current_match = code
    session.flush()
    return snapshot(session, match, user)


@router.get('/matches/{code}')
def get_match(code: str, user=Depends(identity), session=Depends(db_session)):
    return snapshot(session, require_match(session, code, user), user)


class RatedMove(BaseModel):
    move: str = Field(pattern=r'^[a-h][1-8][a-h][1-8][qrbn]?$', min_length=4, max_length=5)
    ply: int = Field(ge=0, le=600)


@router.post('/matches/{code}/move', dependencies=[Depends(same_origin)])
def move(code: str, req: RatedMove, user=Depends(identity), session=Depends(db_session)):
    match = require_match(session, code, user)
    board = board_for(match)
    settle_clock(session, match, board)
    if match.status == 'finished':
        return snapshot(session, match, user)
    if match.status != 'active':
        raise HTTPException(409, 'Wait for another player to join.')
    if req.ply != len(match.moves):
        raise HTTPException(409, 'The position changed. Refresh the match before moving.')
    mover = match.white_id if board.turn else match.black_id
    if user['id'] != mover:
        raise HTTPException(403, 'It is your opponent\'s turn.')
    try:
        candidate = chess.Move.from_uci(req.move)
        if candidate not in board.legal_moves: raise ValueError
    except ValueError:
        raise HTTPException(400, 'That move is not legal.') from None
    white, black = remaining(match, board)
    match.white_seconds, match.black_seconds = white, black
    match.clock_at = now()
    board.push(candidate)
    match.moves = [*match.moves, req.move]
    outcome = board.outcome(claim_draw=True)
    if outcome:
        finish(session, match, outcome.result(), outcome.termination.name.replace('_', ' ').lower())
    session.flush()
    return snapshot(session, match, user)


@router.post('/matches/{code}/resign', dependencies=[Depends(same_origin)])
def resign(code: str, user=Depends(identity), session=Depends(db_session)):
    match = require_match(session, code, user)
    board = board_for(match)
    settle_clock(session, match, board)
    if match.status == 'waiting':
        match.status = 'cancelled'
        session.get(Player, match.white_id).current_match = None
    elif match.status == 'active':
        finish(session, match, '0-1' if user['id'] == match.white_id else '1-0', 'resignation')
    session.flush()
    return snapshot(session, match, user)
