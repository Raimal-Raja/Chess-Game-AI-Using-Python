const { StockfishClient } = require("../web/static/stockfish-client.js");
const assert = require("node:assert/strict");
class Worker {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.commands = [];
    this.closed = false;
    Worker.instances.push(this);
  }
  postMessage(text) {
    this.commands.push(text);
  }
  emit(text) {
    this.onmessage({ data: text });
  }
  terminate() {
    this.closed = true;
  }
}
global.Worker = Worker;
(async () => {
  const engine = new StockfishClient(),
    infos = [];
  const pending = engine.search({
    moves: ["e2e4"],
    full: true,
    seconds: 1,
    onInfo: (info) => infos.push(info),
  });
  const worker = Worker.instances.at(-1);
  assert(worker.url.endsWith("stockfish-19-single.js"));
  worker.emit("uciok");
  assert(worker.commands.includes("setoption name Skill Level value 20"));
  worker.emit("readyok");
  assert(worker.commands.includes("position startpos moves e2e4"));
  assert(worker.commands.includes("go movetime 1000"));
  worker.emit("info depth 18 nodes 12345 score cp -42 pv e7e5 g1f3");
  assert.deepEqual(infos[0].score, { type: "cp", value: -42 });
  assert.equal(infos[0].depth, 18);
  worker.emit("bestmove e7e5 ponder g1f3");
  assert.equal(await pending, "e7e5");
  assert(worker.closed);
  const stale = engine.search({ seconds: 1 });
  const staleWorker = Worker.instances.at(-1);
  const rejected = assert.rejects(stale, /cancelled/);
  engine.cancel();
  await rejected;
  assert(staleWorker.closed);
  const failed = engine.search({ seconds: 1 });
  Worker.instances.at(-1).onerror();
  await assert.rejects(failed, /could not load/);
  const invalid = engine.search({ seconds: 1 });
  Worker.instances.at(-1).emit("bestmove (none)");
  await assert.rejects(invalid, /no playable move/);
  console.log(
    "PASS: UCI handshake, full engine, move history, telemetry, cancellation, worker failure, invalid bestmove.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
