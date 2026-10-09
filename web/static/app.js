const $=id=>document.getElementById(id);
const glyphs={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
let state=null,selected=null,busy=false,epoch=0,flipped=false,pendingPromotion=null;
let config={mode:'ai',side:'white',level:2},next={...config};
try{if(localStorage.getItem('chess-theme')==='light')document.body.classList.add('light');}catch{}
async function api(endpoint,payload){const response=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw Error(data.detail||'Unable to complete this move.');return data;}
function isHuman(){return config.mode==='local'||state.turn===config.side;}
function render(){
 $('board').replaceChildren();const legal=selected?state.legal_moves.filter(m=>m.startsWith(selected)):[];
 const last=state.moves.at(-1)||'';
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const file=flipped?7-col:col,rank=flipped?row+1:8-row,square=String.fromCharCode(97+file)+rank,piece=state.pieces[square];
  const btn=document.createElement('button');btn.className='square'+((file+rank)%2===0?' dark':'');btn.dataset.square=square;
  btn.setAttribute('aria-label',square+(piece?' '+(piece===piece.toUpperCase()?'white ':'black ')+({k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'}[piece.toLowerCase()]):' empty'));
  if(last.slice(0,2)===square||last.slice(2,4)===square)btn.classList.add('last');if(square===selected)btn.classList.add('selected');if(legal.some(m=>m.slice(2,4)===square))btn.classList.add('legal');if(state.check&&square===state.king)btn.classList.add('check');
  if(piece){const el=document.createElement('span');el.className='piece '+(piece===piece.toUpperCase()?'white':'black');el.textContent=glyphs[piece];btn.append(el);}
  if(col===0){const el=document.createElement('span');el.className='coord rank';el.textContent=rank;btn.append(el);}if(row===7){const el=document.createElement('span');el.className='coord file';el.textContent=String.fromCharCode(97+file);btn.append(el);}
  btn.onclick=()=>clickSquare(square);$('board').append(btn);
 }
 $('status').textContent=busy?'AI is thinking…':state.status;$('indicator').textContent=state.game_over?'● FINISHED':busy?'● THINKING':'● LIVE';
 $('hint').textContent=state.game_over?'A game to learn from. Ready for another?':busy?'Looking for a better next move.':isHuman()?'Your turn. Select a piece to see its legal moves.':'The board is in good hands.';
 $('undo').disabled=busy||!state.moves.length;$('export').disabled=!state.moves.length;
 $('move-count').textContent=Math.ceil(state.history.length/2)+' moves';
 if(state.history.length){$('history').replaceChildren();for(let i=0;i<state.history.length;i+=2){const row=document.createElement('div');row.className='history-row';for(const text of [i/2+1+'.',state.history[i],state.history[i+1]||'—']){const cell=document.createElement('span');cell.textContent=text;row.append(cell);}$('history').append(row);}$('history').scrollTop=$('history').scrollHeight;}
 else $('history').innerHTML='<div class="empty"><span>♘</span><p>Every great game starts<br>with a single move.</p></div>';
 const top=flipped?'white':'black',bottom=flipped?'black':'white';
 for(const [prefix,side] of [['opponent',top],['you',bottom]]){$(prefix+'-name').textContent=config.mode==='local'?(side==='white'?'White player':'Black player'):(side===config.side?'You':'Studio AI');$(prefix+'-detail').textContent=side[0].toUpperCase()+side.slice(1)+' · '+(config.mode==='ai'&&side!==config.side?['','Casual','Balanced','Challenging'][config.level]:'Make it count');}
 $('top-tag').textContent=config.mode==='local'?'PLAYER':top===config.side?'YOUR SIDE':'OPPONENT';$('bottom-tag').textContent=config.mode==='local'?'PLAYER':bottom===config.side?'YOUR SIDE':'OPPONENT';
}
function clickSquare(square){if(busy||state.game_over||!isHuman()||pendingPromotion)return;const candidates=selected?state.legal_moves.filter(m=>m.startsWith(selected+square)):[];if(candidates.length>1){pendingPromotion=candidates;$('promotion-options').replaceChildren();for(const move of candidates){const btn=document.createElement('button');btn.textContent=glyphs[move[4]];btn.setAttribute('aria-label','Promote to '+({q:'queen',r:'rook',b:'bishop',n:'knight'}[move[4]]));btn.onclick=()=>{$('promotion').close();pendingPromotion=null;play(move);};$('promotion-options').append(btn);}$('promotion').showModal();return;}if(candidates.length===1){play(candidates[0]);return;}const p=state.pieces[square];selected=p&&(p===p.toUpperCase())===(state.turn==='white')&&selected!==square?square:null;render();}
async function play(move){const token=epoch;busy=true;selected=null;$('error').textContent='';try{const result=await api('move',{moves:state.moves,move});if(token!==epoch)return;state=result;busy=false;render();await runAI();}catch(error){if(token===epoch){busy=false;$('error').textContent=error.message;render();}}}
async function runAI(){if(config.mode!=='ai'||state.game_over||isHuman())return;const token=epoch;busy=true;render();try{const result=await api('ai',{moves:state.moves,level:config.level});if(token!==epoch)return;state=result;}catch(error){if(token===epoch)$('error').textContent=error.message+' Start a new game to retry.';}finally{if(token===epoch){busy=false;render();}}}
async function newGame(){const token=++epoch;busy=true;selected=null;pendingPromotion=null;$('promotion').close();config={...next};flipped=config.mode==='ai'&&config.side==='black';$('error').textContent='';try{const result=await api('state',{moves:[]});if(token!==epoch)return;state=result;busy=false;render();await runAI();}catch(error){if(token===epoch){busy=false;$('error').textContent=error.message;}}}
$('new').onclick=newGame;
$('undo').onclick=async()=>{if(busy||!state.moves.length)return;const token=++epoch;busy=true;selected=null;let count=1;if(config.mode==='ai'&&state.turn===(config.side==='white'?'white':'black'))count=2;try{const result=await api('state',{moves:state.moves.slice(0,Math.max(0,state.moves.length-count))});if(token!==epoch)return;state=result;busy=false;render();await runAI();}catch(error){if(token===epoch){busy=false;$('error').textContent=error.message;render();}}};
$('flip').onclick=()=>{flipped=!flipped;render();};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([state.pgn],{type:'application/x-chess-pgn'}));const a=document.createElement('a');a.href=url;a.download='chess-studio.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
for(const btn of document.querySelectorAll('[data-mode]'))btn.onclick=()=>{next.mode=btn.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===btn));$('ai-settings').hidden=next.mode!=='ai';};
for(const btn of document.querySelectorAll('[data-side]'))btn.onclick=()=>{next.side=btn.dataset.side;document.querySelectorAll('[data-side]').forEach(b=>b.classList.toggle('active',b===btn));};
$('level').onchange=()=>next.level=Number($('level').value);
$('theme').onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('chess-theme',document.body.classList.contains('light')?'light':'dark');}catch{};$('theme').textContent=document.body.classList.contains('light')?'☾ Dark mode':'☀ Light mode';};
$('cancel-promotion').onclick=()=>{$('promotion').close();pendingPromotion=null;};$('promotion').addEventListener('cancel',()=>pendingPromotion=null);
newGame();
