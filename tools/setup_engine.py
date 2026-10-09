"""Install pinned, unmodified Stockfish.js builds and their GPL notices locally."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

VERSION = '19.0.0'
INTEGRITY = 'sha512-jDyYLbqNpboQcMs5HodTHI2CrKL74zkQWb1+sgoNXw5HI6avTblW4G0X7afFt3BBOc6VbTSkOV64EUxm/DWSpg=='
ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'web/static/engine'

def install():
    with urllib.request.urlopen(f'https://registry.npmjs.org/stockfish/{VERSION}', timeout=30) as response:
        metadata = json.load(response)
    with urllib.request.urlopen(metadata['dist']['tarball'], timeout=180) as response:
        data = response.read()
    expected = INTEGRITY
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if actual != expected:
        raise RuntimeError('Stockfish package integrity check failed.')
    TARGET.mkdir(parents=True, exist_ok=True)
    wanted = {'stockfish-19-lite-single.js','stockfish-19-lite-single.wasm',
              'stockfish-19-single.js','stockfish-19-single.wasm','Copying.txt'}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        found=set()
        for member in archive.getmembers():
            name=Path(member.name).name
            if name in wanted and member.isfile():
                (TARGET / name).write_bytes(archive.extractfile(member).read())
                found.add(name)
        if found != wanted:
            raise RuntimeError(f'Missing engine assets: {wanted-found}')
    (TARGET / 'source.json').write_text(json.dumps({'version': VERSION, 'integrity': expected,
        'source': 'https://github.com/nmrugg/stockfish.js/tree/v19.0.0',
        'package': metadata['dist']['tarball'], 'license': 'GPL-3.0'}, indent=2))
    print(f'Stockfish {VERSION} assets ready: {TARGET}')

if __name__ == '__main__':
    install()
