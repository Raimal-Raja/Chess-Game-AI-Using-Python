# Chess Studio — Python + Stockfish

A browser chess app with a responsive board, device-local chess.js rules and a separate FastAPI rules API, and Stockfish 19 running locally in a Web Worker. The original Pygame desktop game remains available in `src/`.

## Quick start

Python 3.12 is used in CI. Create a virtual environment, then:

```bash
python -m pip install -r requirements-web.txt
python tools/setup_engine.py
python -m uvicorn web.app:app --reload
```

Open http://127.0.0.1:8000. No paid AI API, GPU, or external chess service is required during play. The engine setup needs an internet connection once and installs the pinned, checksum-verified Stockfish.js 19.0.0 assets.

## Play

Choose your color, engine level and thinking time, then click **New game**. Click a piece and its highlighted destination; keyboard users can navigate squares with arrow keys and use Enter or Space to select. All four promotions are available.

| Level | Engine | Skill setting |
| --- | --- | --- |
| Casual | Stockfish 19 Lite | 3 / 20 |
| Club | Stockfish 19 Lite | 10 / 20 |
| Expert | Stockfish 19 Lite | 20 / 20 |
| Maximum | Full Stockfish 19 | 20 / 20, no Elo limit |

Thinking time can be 1 (default), 3, 8, or 15 seconds per move. Club / Lite is the default engine. Maximum is the strongest available build and downloads about 94 MB on first use; Lite downloads about 1.6 MB. The loaded engine stays ready between moves and hints. Download progress is shown; the loading watchdog resets while data arrives. Existing saved games from the old defaults migrate to Lite and one-second thinking without losing moves. If Maximum fails, **Retry with faster engine** switches the current game to Club / Lite. Engine computation runs on the player's device, with a single thread and 64 MB hash for Full (16 MB for Lite). These names are difficulty presets, not measured Elo ratings. Device speed and allotted search time affect playing strength. No guarantee of beating every human opponent is implied.

## Features

- Human White or Black versus Stockfish, plus local pass-and-play for two humans.
- Responsive board with image pieces, correctly colored squares, coordinates, legal-move targets, last-move and check highlights.
- Dark/light themes, captured pieces, distinct move, capture, check, new-game and end-game sounds with a saved mute preference and keyboard navigation.
- Search depth, node count, evaluation from White's perspective, and a suggested continuation in coordinate notation.
- Find a hint without making a move; suggested squares appear in gold.
- Undo, rotate the board, reset and download the game as PGN.
- Restore the game and settings from browser storage on reload. Each browser owns its history; no global server game is shared.
- Castling, en passant, four promotion choices, checkmate, stalemate, insufficient material and draw detection through chess.js in the browser and python-chess in the API.
- Safe search cancellation on reset/navigation, retry after engine failures, and local validation of every Stockfish move.

Claimable repetition and fifty-move draws are automatically accepted. Saved games are local to that browser/device, not cloud accounts. Two-player mode is local, not online multiplayer. A hint is engine assistance and changes the nature of unaided play.

The `/api/ai` endpoint retains the small Python search for regression/comparison testing. The browser opponent always uses Stockfish; it never silently falls back to this weaker search.

## Free Render deployment

Connect this repository and choose a **Free** Python Web Service:

- Build: `pip install -r requirements-web.txt && python tools/setup_engine.py`
- Start: `uvicorn web.app:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

Or use the included `render.yaml` Blueprint. No Node runtime is needed for deployment: the Python build step prepares the browser engine files. Render supplies an HTTPS `onrender.com` address. Its free instance sleeps when idle and has bandwidth/build limits; the full engine's initial download consumes hosting bandwidth. Games do not need a database.

This is a portfolio/demo app, without accounts, online matchmaking, authentication or production traffic controls. Running it locally is also free.

## Tests

```bash
python -m pip install pytest httpx pygame
python -m pytest tests -q
npm install
npm run test:engine
npm run test:rules
```

With the web server running in another terminal:

```bash
npm run test:ui
npm run test:browser
npm run test:interaction
```

Node.js 22 or later is needed for JavaScript tests. Install Playwright Chromium with `npx playwright install chromium` before the real-browser suite. Set `CHESS_TEST_URL` if the server is not at http://127.0.0.1:8000. The browser suite requires engine assets installed above. Optional `CHESS_CHROMIUM_PATH` and `CHESS_CHROMIUM_ARGS` environment variables support a separately installed Chromium.

The DOM suite stubs engine decisions to isolate UI controls. The real-browser suite exercises the actual Full/Lite WASM engines, both player sides, hints, cancellation, reload recovery, keyboard navigation and mobile layout. Tactical cases cover both engine builds and colors. They are integration checks, not a competitive Elo benchmark. CI runs Python, UCI adapter and DOM tests, plus the actual browser suite.

## Original desktop version

```bash
python -m pip install -r requirements.txt
cd src
python main.py
```

The desktop version uses Pygame and its existing bot/Windows-engine integrations. Recent fixes correct Black's search evaluation, discard moves computed before reset, clear completed worker flags and validate returned moves. Windows Stockfish/Komodo binaries are not used by the browser app. Full interactive coverage of the original Pygame GUI and those binaries has not been established.

## Engine attribution

Stockfish.js 19 by Nathan Rugg / Chess.com and Stockfish contributors is GPLv3. Unmodified engine assets, the GPL text and source metadata are installed together. The GUI links to the license and corresponding upstream source. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Responsive, immediate play

Human and engine moves are validated locally with the bundled chess.js library. After the page and engine load, gameplay, undo, new games and PGN export do not depend on Render API requests. Board buttons persist between renders so rapid taps and keyboard focus are retained. Undo cancels a search; selecting a piece cancels a hint without blocking play. Phone, tablet, landscape and desktop layouts adapt board size, controls and promotion dialogs, with reduced-motion support.

Developed by Data Scientist/ML Engineer Raimal Raja Kolhi.
GitHub: https://github.com/Raimal-Raja
LinkedIn: https://www.linkedin.com/in/raimal-raja-kolhi-860a032bb/
Instagram: https://www.instagram.com/professor_raimal/
