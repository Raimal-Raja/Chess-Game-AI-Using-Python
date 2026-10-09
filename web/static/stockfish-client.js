/* UCI adapter. Each search owns its worker so cancellation cannot leak a stale move. */
class StockfishClient {
  constructor() {
    this.worker = null;
    this.cancelPending = null;
  }
  cancel() {
    if (this.cancelPending) this.cancelPending(new Error("Search cancelled."));
    this.cancelPending = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }
  async search({
    moves = [],
    fen = null,
    full = false,
    skill = 20,
    seconds = 8,
    onInfo = () => {},
    onStatus = () => {},
  }) {
    this.cancel();
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new Error(
        "Stockfish needs a browser with WebAssembly and Web Workers.",
      );
    }
    const name = full ? "stockfish-19-single" : "stockfish-19-lite-single";
    return new Promise((resolve, reject) => {
      let settled = false,
        started = false,
        timer;
      const worker = new Worker("/static/engine/" + name + ".js");
      this.worker = worker;
      const finish = (error, move) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        if (this.worker === worker) {
          this.worker = null;
          this.cancelPending = null;
        }
        if (error) reject(error);
        else resolve(move);
      };
      this.cancelPending = (error) => finish(error);
      timer = setTimeout(
        () =>
          finish(
            new Error(
              "Engine loading timed out. Check your connection and retry.",
            ),
          ),
        120000,
      );
      onStatus(
        full
          ? "Loading full Stockfish · about 94 MB on first use"
          : "Loading Stockfish Lite · about 1.6 MB",
      );
      worker.onerror = () =>
        finish(
          new Error(
            "Stockfish could not load. Install the engine assets, then retry.",
          ),
        );
      worker.onmessage = (event) => {
        for (const line of String(event.data).split("\n")) {
          if (line === "uciok") {
            worker.postMessage("setoption name Hash value " + (full ? 64 : 16));
            worker.postMessage("setoption name Skill Level value " + skill);
            worker.postMessage("setoption name UCI_LimitStrength value false");
            worker.postMessage("ucinewgame");
            worker.postMessage("isready");
          } else if (line === "readyok" && !started) {
            started = true;
            clearTimeout(timer);
            timer = setTimeout(
              () =>
                finish(
                  new Error(
                    "Engine search timed out. Retry with a shorter thinking time.",
                  ),
                ),
              seconds * 1000 + 15000,
            );
            onStatus("Stockfish is thinking…");
            worker.postMessage(
              fen
                ? "position fen " + fen
                : "position startpos" +
                    (moves.length ? " moves " + moves.join(" ") : ""),
            );
            worker.postMessage("go movetime " + Math.round(seconds * 1000));
          } else if (line.startsWith("info ") && line.includes(" depth ")) {
            const depth = line.match(/\bdepth (\d+)/),
              nodes = line.match(/\bnodes (\d+)/),
              score = line.match(/\bscore (cp|mate) (-?\d+)/),
              pv = line.match(/\bpv (.+)/);
            onInfo({
              depth: depth ? Number(depth[1]) : 0,
              nodes: nodes ? Number(nodes[1]) : 0,
              score: score ? { type: score[1], value: Number(score[2]) } : null,
              pv: pv ? pv[1].split(" ") : [],
            });
          } else if (line.startsWith("bestmove ")) {
            const move = line.split(" ")[1];
            if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) finish(null, move);
            else finish(new Error("Engine returned no playable move."));
          }
        }
      };
      worker.postMessage("uci");
    });
  }
}
if (typeof module !== "undefined") module.exports = { StockfishClient };
