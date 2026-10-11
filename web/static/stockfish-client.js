/* Keep an idle engine alive. Cancelling an active search destroys its worker,
   so a late bestmove can never be applied to a different game. */
class StockfishClient {
  constructor() {
    this.worker = null;
    this.full = null;
    this.ready = false;
    this.task = null;
    this.progress = null;
  }
  dispose() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = false;
    this.full = null;
    if (this.progress) {
      this.progress.port1.close();
      this.progress.port2.close();
      this.progress = null;
    }
  }
  cancel() {
    if (this.task) this.finish(this.task, new Error("Search cancelled."));
  }
  finish(task, error, move) {
    if (this.task !== task) return;
    clearTimeout(task.timer);
    this.task = null;
    if (error) {
      this.dispose();
      task.reject(error);
    } else task.resolve(move);
  }
  loadingTimer(task) {
    clearTimeout(task.timer);
    task.timer = setTimeout(() => this.finish(task, new Error(
      "Engine download stalled. Check your connection, then retry. Maximum needs about 94 MB; Club and Expert use Lite."
    )), 120000);
  }
  configure(task) {
    this.worker.postMessage("setoption name Hash value " + (task.full ? 64 : 16));
    this.worker.postMessage("setoption name Skill Level value " + task.skill);
    this.worker.postMessage("setoption name UCI_LimitStrength value false");
    this.worker.postMessage("ucinewgame");
    this.worker.postMessage("isready");
  }
  message(worker, data) {
    if (this.worker !== worker) return;
    const task = this.task;
    if (!task) return;
    for (const raw of String(data).split("\n")) {
      const line = raw.trim();
      if (line === "uciok") {
        this.ready = true;
        this.configure(task);
      } else if (line === "readyok" && !task.started) {
        task.started = true;
        clearTimeout(task.timer);
        task.timer = setTimeout(() => this.finish(task, new Error(
          "Engine search timed out. Retry with a shorter thinking time."
        )), task.seconds * 1000 + 15000);
        task.onStatus("Stockfish is thinking…");
        worker.postMessage(task.fen ? "position fen " + task.fen :
          "position startpos" + (task.moves.length ? " moves " + task.moves.join(" ") : ""));
        worker.postMessage("go movetime " + Math.round(task.seconds * 1000));
      } else if (line.startsWith("info ") && line.includes(" depth ")) {
        const depth = line.match(/\bdepth (\d+)/), nodes = line.match(/\bnodes (\d+)/),
          score = line.match(/\bscore (cp|mate) (-?\d+)/), pv = line.match(/\bpv (.+)/);
        task.onInfo({depth: depth ? Number(depth[1]) : 0,
          nodes: nodes ? Number(nodes[1]) : 0,
          score: score ? {type: score[1], value: Number(score[2])} : null,
          pv: pv ? pv[1].split(" ") : []});
      } else if (line.startsWith("bestmove ")) {
        const move = line.split(/\s+/)[1];
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) this.finish(task, null, move);
        else this.finish(task, new Error("Engine returned no playable move."));
      }
    }
  }
  async search({moves = [], fen = null, full = false, skill = 20, seconds = 1,
    onInfo = () => {}, onStatus = () => {}}) {
    this.cancel();
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined")
      throw new Error("Stockfish needs a browser with WebAssembly and Web Workers.");
    if (this.worker && this.full !== full) this.dispose();
    return new Promise((resolve, reject) => {
      const task = {moves, fen, full, skill, seconds, onInfo, onStatus,
        resolve, reject, started: false, loaded: 0};
      this.task = task;
      this.loadingTimer(task);
      try {
        if (this.worker && this.ready) {
          onStatus("Engine ready · starting search…");
          this.configure(task);
          return;
        }
        const name = full ? "stockfish-19-single" : "stockfish-19-lite-single";
        onStatus(full ? "Loading full Stockfish · about 94 MB on first use" :
          "Loading Stockfish Lite · about 1.6 MB on first use");
        const worker = new Worker("/static/engine/" + name + ".js");
        this.worker = worker;
        this.full = full;
        worker.onerror = () => {
          if (this.worker !== worker) return;
          if (this.task) this.finish(this.task, new Error(
            "Stockfish could not load. Check your connection or engine assets, then retry."
          ));
          else this.dispose();
        };
        worker.onmessage = (event) => this.message(worker, event.data);
        if (typeof MessageChannel !== "undefined") {
          const channel = new MessageChannel();
          this.progress = channel;
          channel.port1.onmessage = ({data}) => {
            const active = this.task;
            if (this.worker !== worker || !active || active.started || !data.loaded) return;
            if (data.loaded > active.loaded) {
              active.loaded = data.loaded;
              this.loadingTimer(active);
            }
            const total = Number(data.total), loaded = Number(data.loaded);
            if (Number.isFinite(total) && total > 0 && Number.isFinite(loaded))
              active.onStatus("Downloading Stockfish " + (full ? "Full" : "Lite") +
                " · " + Math.min(100, Math.round(loaded / total * 100)) + "% · " +
                (loaded / 1048576).toFixed(1) + " MB" +
                (loaded >= total ? " · preparing engine…" : ""));
          };
          worker.postMessage({progressPort: channel.port2}, [channel.port2]);
        }
        worker.postMessage("uci");
      } catch (error) { this.finish(task, error); }
    });
  }
}
if (typeof module !== "undefined") module.exports = {StockfishClient};
