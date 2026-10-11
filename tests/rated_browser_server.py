"""Local test-only identity provider; never used by the deployed application."""
import os
from pathlib import Path
import tempfile
import uuid
from fastapi import HTTPException

os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(tempfile.gettempdir()) / ('chess-rated-test-'+uuid.uuid4().hex+'.sqlite'))
os.environ['SUPABASE_URL'] = 'https://test-provider.invalid'
os.environ['SUPABASE_PUBLISHABLE_KEY'] = 'test-only-public-key'
os.environ['SITE_URL'] = 'http://127.0.0.1:8766'
os.environ.pop('RENDER', None)
from web.app import app
from web import rated

users = {'white@example.test': {'id': str(uuid.UUID(int=1)), 'user_metadata': {'display_name': 'Alice'}},
         'black@example.test': {'id': str(uuid.UUID(int=2)), 'user_metadata': {'display_name': 'Bob'}}}
access = {}
refreshes = {}

def session(user):
    token = uuid.uuid4().hex
    refresh = uuid.uuid4().hex
    access[token] = user
    refreshes[refresh] = user
    return {'access_token': token, 'refresh_token': refresh, 'expires_in': 3600}

def auth(path, *, method='POST', payload=None, token=None):
    if path == 'user' and method == 'GET':
        if token not in access: raise HTTPException(401, 'Sign in again.')
        return access[token]
    if path.startswith('token?grant_type=password'):
        if payload['email'] not in users or payload['password'] != 'password123': raise HTTPException(401, 'Invalid sign in.')
        return session(users[payload['email']])
    if path.startswith('token?grant_type=refresh_token'):
        user = refreshes.pop(payload['refresh_token'], None)
        if not user: raise HTTPException(401, 'Sign in again.')
        return session(user)
    if path.startswith('logout'):
        user = access.pop(token, None)
        for key in list(refreshes):
            if refreshes[key] == user: del refreshes[key]
        return {}
    raise HTTPException(400, 'Unsupported test request.')

if __name__ == '__main__':
    rated.auth_request = auth
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8766)
