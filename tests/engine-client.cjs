const { StockfishClient } = require('../web/static/stockfish-client.js');
const assert = require('node:assert/strict');
class Worker {
  static instances = [];
  constructor(url) { this.url=url; this.commands=[]; this.closed=false; Worker.instances.push(this); }
  postMessage(text) { this.commands.push(text); }
  emit(text) { this.onmessage({data:text}); }
  terminate() { this.closed=true; }
}
class Channel {
  constructor() { this.port1={close(){},onmessage:null}; this.port2={close(){}}; }
}
global.Worker=Worker;
global.MessageChannel=Channel;
const timers=new Map();let id=0;
global.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};
global.clearTimeout=(id)=>timers.delete(id);
function ready(worker) {worker.emit('uciok');worker.emit('readyok');}
(async()=>{
  const engine=new StockfishClient(),infos=[],statuses=[];
  const first=engine.search({moves:['e2e4'],full:true,seconds:1,onInfo:i=>infos.push(i),onStatus:s=>statuses.push(s)});
  const worker=Worker.instances.at(-1);
  assert(worker.url.endsWith('stockfish-19-single.js'));
  assert(worker.commands[0].progressPort);
  const timer=engine.task.timer;
  engine.progress.port1.onmessage({data:{loaded:1048576,total:2097152}});
  assert(!timers.has(timer));assert(statuses.at(-1).includes('50%'));
  ready(worker);
  assert(worker.commands.includes('position startpos moves e2e4'));
  assert(worker.commands.includes('go movetime 1000'));
  worker.emit('info depth 18 nodes 12345 score cp -42 pv e7e5 g1f3');
  assert.deepEqual(infos[0].score,{type:'cp',value:-42});
  worker.emit('bestmove e7e5 ponder g1f3');assert.equal(await first,'e7e5');
  assert(!worker.closed);assert.equal(timers.size,0);
  const count=Worker.instances.length;
  const second=engine.search({moves:['e2e4','e7e5','g1f3'],full:true,skill:10});
  assert.equal(Worker.instances.length,count);
  worker.emit('readyok');worker.emit('bestmove b8c6');assert.equal(await second,'b8c6');
  assert.equal(worker.commands.filter(c=>c==='uci').length,1);
  assert(worker.commands.includes('setoption name Skill Level value 10'));
  const switched=engine.search({full:false});assert(worker.closed);
  const lite=Worker.instances.at(-1);ready(lite);lite.emit('bestmove e2e4');await switched;
  const stale=engine.search({full:false});const rejected=assert.rejects(stale,/cancelled/);
  engine.cancel();await rejected;assert(lite.closed);
  const next=engine.search({full:false});const newWorker=Worker.instances.at(-1);
  lite.emit('bestmove d2d4');assert.equal(engine.task.started,false);
  ready(newWorker);newWorker.emit('bestmove e2e4');assert.equal(await next,'e2e4');
  newWorker.onerror();assert.equal(engine.worker,null);
  const failed=engine.search({});const failWorker=Worker.instances.at(-1);
  const fails=assert.rejects(failed,/could not load/);failWorker.onerror();await fails;assert(failWorker.closed);
  const stalled=engine.search({});const stall=assert.rejects(stalled,/download stalled/);
  timers.get(engine.task.timer).fn();await stall;
  const timed=engine.search({});ready(Worker.instances.at(-1));const timedOut=assert.rejects(timed,/search timed out/);
  timers.get(engine.task.timer).fn();await timedOut;
  const invalid=engine.search({});const noMove=assert.rejects(invalid,/no playable move/);
  Worker.instances.at(-1).emit('bestmove (none)');await noMove;
  global.Worker=class {constructor(){throw Error('Worker blocked');}};
  await assert.rejects(engine.search({}),/Worker blocked/);
  assert.equal(timers.size,0);engine.dispose();
  console.log('PASS: engine reuse, profile switch, download progress/watchdog, telemetry, cancellation/stale moves, idle/load/search failures, invalid moves and constructor failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
