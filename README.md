# Chess-Game-AI-Using-Python

Chess Studio adds a responsive browser interface and a FastAPI backend alongside the original Pygame desktop game.

## Play in your browser

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements-web.txt
python -m uvicorn web.app:app --reload
```

Open http://127.0.0.1:8000. Choose White or Black, select an AI difficulty, then click New game. Click a piece and its highlighted destination. Two players can also share the same browser.

### Browser features

- Responsive green board, dark/light themes, board rotation, move journal, and check highlights.
- Human play as either color; Casual random AI and bounded alpha-beta search at Balanced/Challenging levels.
- Legal moves validated by python-chess: castling, en passant, four promotion choices, checkmate, stalemate, insufficient material, repetition, and the fifty-move rule.
- Undo (a full human/AI turn when applicable), new game, and PGN download.
- Separate move histories for each browser. Reset invalidates outstanding AI responses.

Claimable repetition and fifty-move draws are automatically accepted. Games are held in browser memory and restart on page reload. Two-player mode is local pass-and-play, not online multiplayer. Browser AI uses its own portable Python search; the original Windows Stockfish/Komodo engines are desktop-only and are not required for web hosting.

### Free Render deployment

Connect this repository to Render, create a Python Web Service, and select Free:

- Build: `pip install -r requirements-web.txt`
- Start: `uvicorn web.app:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

Alternatively use the included `render.yaml` Blueprint. Render assigns an HTTPS `onrender.com` address. Free services sleep when idle and have monthly usage limits. This version needs no database; it is intended as a portfolio/demo app, without production rate limiting or authentication.

### Verification

```bash
python -m pip install pytest httpx
python -m pytest tests -q
```

To run DOM interaction checks, start the web server in another terminal, then run `npm install` and `npm run test:ui` (Node.js 22 or newer). These test user interactions against the live API; they do not replace screenshot review in a real browser.

Web regression tests cover both user colors, AI legality and mate selection for both colors, special moves, terminal states, PGN generation, invalid requests, and isolation between games.

## Original desktop version

## Setup and repository reference

### Project structure

- [assets](assets)
- [build_exe.bat](build_exe.bat)
- [chess_game.spec](chess_game.spec)
- [data](data)
- [docs](docs)
- [engines](engines)
- [requirements.txt](requirements.txt)
- [snapshots](snapshots)
- [src](src)
- [tools](tools)

### Getting started

```bash
git clone https://github.com/Raimal-Raja/Chess-Game-AI-Using-Python.git
cd Chess-Game-AI-Using-Python
```

Create and activate a virtual environment, then install the project dependencies:

```bash
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r "requirements.txt"
```

Application entry point:

```bash
cd "src"
python main.py
```

### Configuration and limitations

The desktop interface needs its GUI dependencies and any configured engine assets. Engine binaries and interactive matches were not executed during this audit.

### Validation

Recorded checks from the previous maintenance review (2026-10-08): 18 existing Python files passed syntax checks; changed files and new regression tests were checked separately. Syntax checks do not establish full runtime correctness. External APIs, live scraping, GUI interaction, notebook training and production deployment were not comprehensively exercised.

### Contributions

Describe the issue, reproduction steps, environment, and expected behavior when proposing a change. Keep generated environments, credentials, and unnecessary build artifacts out of new commits.

### License

No top-level license file was found during this review.
