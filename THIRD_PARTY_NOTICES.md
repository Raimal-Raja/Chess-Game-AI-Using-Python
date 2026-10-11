# Third-party components

## Stockfish.js 19.0.0

Stockfish.js 19 © 2026 Chess.com, LLC. WebAssembly port maintained by Nathan Rugg.
Based on Stockfish by Tord Romstad, Marco Costalba, Joona Kiiski, Gary Linscott and other contributors.

- License: GNU General Public License version 3.
- Exact browser port source: https://github.com/nmrugg/stockfish.js/tree/v19.0.0
- Source archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.0.tar.gz
- Stockfish source: https://github.com/official-stockfish/Stockfish
- Pinned package: https://registry.npmjs.org/stockfish/-/stockfish-19.0.0.tgz

`tools/setup_engine.py` installs the unmodified Full and Lite single-threaded builds,
upstream `Copying.txt`, and package/version/integrity metadata under `web/static/engine/`.
Engine files are generated during setup/deployment and are not checked into this repository.
The license and exact corresponding source are linked from the browser GUI.

## python-chess

python-chess by Niklas Fiekas and contributors is licensed under GPLv3 or later.
Source and license: https://github.com/niklasf/python-chess

Other runtime/test dependencies retain their respective upstream licenses.
This notice does not grant a new license to pre-existing project assets or code.

## chess.js

The browser bundles chess.js 1.4.0 by Jeff Hlywa under BSD-2-Clause.
The upstream CommonJS build is enclosed in a browser export wrapper; its rules are unmodified.
Source: https://github.com/jhlywa/chess.js/tree/v1.4.0
License: `web/static/vendor/CHESS_LICENSE.txt` (also retained in the bundled script).
