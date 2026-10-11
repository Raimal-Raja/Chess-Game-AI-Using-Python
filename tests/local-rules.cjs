const assert=require('node:assert/strict');
const {Chess}=require('../web/static/vendor/chess.js');
const {BrowserGame}=require('../web/static/local-rules.js');
const fresh=()=>new BrowserGame(Chess);
(async()=>{
  let g=fresh(),s=g.snapshot();assert.equal(Object.keys(s.pieces).length,32);assert.equal(s.legal_moves.length,20);
  assert.throws(()=>g.move('e2e5'));assert.equal(g.snapshot().moves.length,0);
  g.move('e2e4');assert.equal(g.snapshot().pieces.e4,'P');assert.equal(g.snapshot().turn,'black');
  assert.throws(()=>g.restore(['e2e5']));assert.deepEqual(g.snapshot().moves,['e2e4']);
  s=g.restore(['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6']);g.move('e1g1');s=g.snapshot();assert.equal(s.pieces.g1,'K');assert.equal(s.pieces.f1,'R');
  g.restore(['e2e4','a7a6','e4e5','d7d5']);g.move('e5d6');s=g.snapshot();assert.equal(s.pieces.d6,'P');assert(!s.pieces.d5);assert.deepEqual(s.captures.white,['p']);
  for(const p of ['q','r','b','n']){g.restore(['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2']);g.move('b7a8'+p);assert.equal(g.snapshot().pieces.a8,p.toUpperCase());}
  s=g.restore(['f2f3','e7e5','g2g4','d8h4']);assert(s.game_over);assert(s.status.includes('Black wins'));assert.equal(s.legal_moves.length,0);
  const exported=new Chess();exported.loadPgn(s.pgn);assert.equal(exported.fen(),s.fen);assert.equal(exported.getHeaders().Result,'0-1');
  s=g.restore(['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1']);assert(s.status.includes('threefold repetition'));
  for(const [fen,reason] of [['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1','stalemate'],['7k/8/6K1/8/8/8/8/8 w - - 0 1','insufficient material'],['7k/8/8/8/8/8/R7/K7 w - - 100 51','fifty moves']]){g=fresh();g.chess.load(fen);assert(g.snapshot().status.includes(reason));}
  if(process.env.CHESS_TEST_URL){
    g=fresh();let seed=12345;
    for(let i=0;i<60;i++){
      s=g.snapshot();const r=await fetch(process.env.CHESS_TEST_URL+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:s.moves})});assert(r.ok);const server=await r.json();
      for(const field of ['fen','turn','pieces','captures','status','game_over','king','check','history'])assert.deepEqual(s[field],server[field],field+' at ply '+i);
      assert.deepEqual([...s.legal_moves].sort(),[...server.legal_moves].sort());
      if(s.game_over)break;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;g.move(s.legal_moves[seed%s.legal_moves.length]);
    }
    console.log('PASS: local state matches Python rules through 60 deterministic plies.');
  }
  console.log('PASS: immediate local rules, rollback, castling, en passant, all promotions, terminal draws, checkmate and PGN.');
})().catch(e=>{console.error(e);process.exitCode=1;});
