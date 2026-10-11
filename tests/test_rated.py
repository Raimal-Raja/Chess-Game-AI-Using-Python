"""No live passwords or provider accounts are used by these tests."""
from datetime import timedelta
import uuid
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from web.app import app
from web import rated

IDS = [str(uuid.UUID(int=i)) for i in range(1, 5)]

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///:memory:')
    monkeypatch.delenv('RENDER', raising=False)
    rated.database.cache_clear()
    def user(request: Request):
        name = request.headers.get('x-player', '1')
        if name not in ('1', '2', '3', '4'):
            from fastapi import HTTPException
            raise HTTPException(401)
        return {'id': IDS[int(name)-1], 'name': 'Player '+name}
    app.dependency_overrides[rated.identity] = user
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()
    rated.database('sqlite:///:memory:').dispose()
    rated.database.cache_clear()


def get(c, path, who='1'):
    return c.get('/rated'+path, headers={'x-player': who})


def post(c, path, who='1', data=None, **headers):
    return c.post('/rated'+path, json=data or {}, headers={'x-player': who, **headers})


def pair(c):
    code = post(c, '/matches').json()['id']
    result = post(c, '/matches/'+code+'/join', '2')
    assert result.status_code == 200
    return code


def test_accounts_and_invitation_rules(client):
    assert get(client, '/me').json()['rating'] == 1200
    assert get(client, '/me').json()['games'] == 0
    response = post(client, '/matches'); assert response.status_code == 200
    code = response.json()['id']
    assert response.json()['state']['legal_moves'] == []
    assert post(client, '/matches').status_code == 409
    assert post(client, '/matches/'+code+'/join').status_code == 400
    assert get(client, '/matches/'+code, '3').status_code == 403
    assert post(client, '/matches/'+code+'/join', '2').status_code == 200
    assert post(client, '/matches/'+code+'/join', '3').status_code == 409
    assert post(client, '/matches', '2').status_code == 409


def test_only_server_validated_turns_and_moves(client):
    code = pair(client)
    assert post(client, '/matches/'+code+'/move', '2', {'move':'e7e5','ply':0}).status_code == 403
    assert post(client, '/matches/'+code+'/move', '3', {'move':'e2e4','ply':0}).status_code == 403
    assert post(client, '/matches/'+code+'/move', data={'move':'e2e5','ply':0}).status_code == 400
    assert post(client, '/matches/'+code+'/move', data={'move':'e2e4','ply':9}).status_code == 409
    result = post(client, '/matches/'+code+'/move', data={'move':'e2e4','ply':0,'rating':9999,'result':'1-0'})
    assert result.json()['state']['moves'] == ['e2e4']
    assert get(client, '/me').json()['rating'] == 1200
    assert post(client, '/matches/'+code+'/move', data={'move':'e2e4','ply':0}).status_code == 409
    assert post(client, '/matches/'+code+'/move', '2', {'move':'e7e5','ply':1}).status_code == 200


def test_checkmate_updates_elo_once_and_records_pgn(client):
    code = pair(client)
    for ply, (who, move) in enumerate([('1','f2f3'),('2','e7e5'),('1','g2g4'),('2','d8h4')]):
        result = post(client, '/matches/'+code+'/move', who, {'move':move,'ply':ply})
        assert result.status_code == 200
    match = result.json()
    assert match['result'] == '0-1' and match['status'] == 'finished'
    assert match['white_delta'] == -16
    assert get(client, '/me').json()['rating'] == 1184
    assert get(client, '/me', '2').json()['rating'] == 1216
    assert get(client, '/me').json()['losses'] == 1
    assert '[Result "0-1"]' in match['state']['pgn']
    for _ in range(3):
        assert post(client, '/matches/'+code+'/resign').status_code == 200
        assert get(client, '/matches/'+code).json()['result'] == '0-1'
    assert get(client, '/me').json()['games'] == 1
    assert get(client, '/me', '2').json()['games'] == 1
    assert get(client, '/me').json()['current_match'] is None
    assert len(get(client, '/leaderboard').json()) == 2
    assert post(client, '/matches').status_code == 200


def test_cancel_waiting_invite_has_no_rating_change(client):
    code = post(client, '/matches').json()['id']
    assert post(client, '/matches/'+code+'/resign').json()['status'] == 'cancelled'
    assert get(client, '/me').json()['rating'] == 1200
    assert get(client, '/me').json()['games'] == 0
    assert post(client, '/matches/'+code+'/join', '2').status_code == 409


def test_resignation_and_rating_persist_across_sessions(client):
    code = pair(client)
    assert post(client, '/matches/'+code+'/resign', '2').json()['white_delta'] == 16
    assert get(client, '/me').json()['rating'] == 1216
    with Session(rated.database('sqlite:///:memory:')) as session:
        assert session.get(rated.Player, IDS[0]).rating == 1216
        assert session.get(rated.Match, code).status == 'finished'


def test_draw_updates_both_accounts_once(client):
    code = pair(client)
    for ply, move in enumerate(['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1']):
        result = post(client, '/matches/'+code+'/move', '1' if ply%2==0 else '2', {'move':move,'ply':ply})
    assert result.json()['result'] == '1/2-1/2'
    assert get(client, '/me').json()['draws'] == 1
    assert get(client, '/me', '2').json()['draws'] == 1
    assert get(client, '/me').json()['rating'] == 1200


def test_timeout_is_authoritative_and_idempotent(client):
    code = pair(client)
    with Session(rated.database('sqlite:///:memory:')) as session, session.begin():
        match = session.get(rated.Match, code)
        match.clock_at = rated.now() - timedelta(seconds=601)
    result = get(client, '/matches/'+code).json()
    assert result['result'] == '0-1' and result['reason'] == 'time expired'
    assert result['white_seconds'] == 0
    assert get(client, '/matches/'+code).json()['white_delta'] == -16
    assert get(client, '/me').json()['games'] == 1


def test_authentication_and_cross_origin_requests_rejected(client):
    assert post(client, '/matches', origin='https://attacker.example').status_code == 403
    app.dependency_overrides.pop(rated.identity)
    assert get(client, '/me').status_code == 401
    assert post(client, '/matches').status_code == 401


def test_secure_http_only_sessions_and_refresh(client, monkeypatch):
    monkeypatch.setenv('SITE_URL', 'https://chess.example')
    def auth(path, **kwargs):
        assert kwargs.get('payload',{}).get('password') == 'password123' or 'refresh' in path
        return {'access_token':'test-access','refresh_token':'test-refresh','expires_in':3600}
    monkeypatch.setattr(rated, 'auth_request', auth)
    response = post(client, '/auth/login', data={'email':'player@example.com','password':'password123'})
    assert response.status_code == 200
    for cookie in response.headers.get_list('set-cookie'):
        assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=lax' in cookie
    response = post(client, '/auth/refresh')
    assert response.status_code == 401  # HTTPS-only cookie is not sent over test HTTP.


def test_signup_requires_confirmation_without_session(client, monkeypatch):
    monkeypatch.setattr(rated, 'auth_request', lambda *args, **kwargs: {'id':IDS[0]})
    result = post(client, '/auth/signup', data={'email':'player@example.com','password':'password123','name':'Player'})
    assert result.status_code == 200 and not result.json()['signed_in']
    assert not result.headers.get_list('set-cookie')


def test_github_pkce_session_bound_callback(client, monkeypatch):
    from urllib.parse import urlparse, parse_qs
    import base64, hashlib
    monkeypatch.setenv('SITE_URL', 'http://testserver')
    monkeypatch.setenv('SUPABASE_URL', 'https://project.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'test-key')
    monkeypatch.setenv('SUPABASE_GITHUB_AUTH', 'true')
    response = client.get('/rated/auth/github', follow_redirects=False)
    assert response.status_code == 307
    params = parse_qs(urlparse(response.headers['location']).query)
    verifier = client.cookies.get('chess_verifier')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    assert params['code_challenge'] == [challenge]
    assert params['redirect_to'] == ['http://testserver/rated/auth/callback']
    assert 'HttpOnly' in response.headers['set-cookie']
    def exchange(path, **kwargs):
        assert path == 'token?grant_type=pkce'
        assert kwargs['payload'] == {'auth_code':'test-code', 'code_verifier':verifier}
        return {'access_token':'access','refresh_token':'refresh'}
    monkeypatch.setattr(rated, 'auth_request', exchange)
    response = client.get('/rated/auth/callback?code=test-code', follow_redirects=False)
    assert response.status_code == 303 and response.headers['location'] == 'http://testserver'
    assert client.cookies.get('chess_access') == 'access'
    assert not client.cookies.get('chess_verifier')
    assert client.get('/rated/auth/callback?code=test-code', follow_redirects=False).status_code == 400


def test_github_disabled_by_default(client):
    assert client.get('/rated/auth/github', follow_redirects=False).status_code == 503
