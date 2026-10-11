const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHESS_CHROMIUM_PATH?{executablePath:process.env.CHESS_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({hasTouch:true});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.audioNotes=[];
   const C=window.AudioContext||window.webkitAudioContext;
   if(C){const original=C.prototype.createOscillator;C.prototype.createOscillator=function(){const o=original.call(this),start=o.start.bind(o);o.start=(...args)=>{window.audioNotes.push(o.frequency.value);return start(...args);};return o;};}
 });
 let apiCalls=0;await page.route('**/api/**',r=>{apiCalls++;return r.abort();});
 await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:8000');
 await page.click('[data-mode="local"]');await page.click('#new');
 const moves=await page.evaluate(()=>{
   const node=document.querySelector('[data-square="e2"]');
   const start=performance.now();
   for(const square of ['e2','e4','d7','d5','e4','d5'])document.querySelector(`[data-square="${square}"]`).click();
   return {elapsed:performance.now()-start,stable:node===document.querySelector('[data-square="e2"]'),moves:JSON.parse(localStorage.getItem('chess-studio-game')).moves};
 });
 assert.deepEqual(moves.moves,['e2e4','d7d5','e4d5']);assert(moves.stable);assert(moves.elapsed<500);
 let notes=await page.evaluate(()=>audioNotes);assert(notes.includes(660));assert(notes.includes(220));
 await page.click('#sound');const muted=await page.evaluate(()=>audioNotes.length);
 await page.tap('[data-square="g8"]');await page.tap('[data-square="f6"]');
 assert.equal(await page.evaluate(()=>audioNotes.length),muted);
 await page.reload();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
 await page.click('#sound');await page.click('#new');
 for(const square of ['e2','e4','d7','d5','f1','b5'])await page.tap(`[data-square="${square}"]`);
 assert((await page.evaluate(()=>audioNotes)).includes(1046));
 await page.click('#new');
 for(const square of ['e2','e4','e7','e5','f1','c4','b8','c6','d1','h5','g8','f6','h5','f7'])await page.tap(`[data-square="${square}"]`);
 notes=await page.evaluate(()=>audioNotes);assert(notes.includes(523));assert(notes.includes(784));assert((await page.locator('#status').textContent()).includes('White wins'));
 console.log(`PASS: six rapid taps applied three legal moves in ${moves.elapsed.toFixed(1)} ms; stable squares, touch input, actual sound notes and persistent mute.`);
 // Block engine loading: moves and Undo must remain responsive and stale replies must not land.
 await page.click('[data-mode="ai"]');await page.click('[data-side="white"]');await page.selectOption('#level','2');await page.click('#new');
 let held;const hold=route=>{held=route;};await page.route('**/static/engine/stockfish-19-lite-single.js',hold);
 await page.tap('[data-square="e2"]');await page.tap('[data-square="e4"]');
 await page.waitForFunction(()=>document.querySelector('#board').getAttribute('aria-busy')==='true');
 await page.click('#board-undo');assert.equal(await page.locator('#status').textContent(),'White to move');
 assert.equal(await page.locator('#move-count').textContent(),'0 moves');
 await page.unroute('**/static/engine/stockfish-19-lite-single.js',hold);if(held)await held.abort().catch(()=>{});
 // A piece selection cancels a pending hint and accepts the move synchronously.
 await page.selectOption('#thinking','3');await page.click('#new');await page.click('#analyse');
 await page.tap('[data-square="d2"]');await page.tap('[data-square="d4"]');
 assert((await page.locator('#history').textContent()).includes('d4'));
 await page.click('#board-undo');await page.waitForTimeout(3500);assert.equal(await page.locator('#move-count').textContent(),'0 moves');
 console.log('PASS: Undo during a blocked engine load; playing during a hint cancels it; no stale moves.');
 await page.click('[data-mode="local"]');await page.click('#new');
 const views=[[320,568],[360,640],[390,844],[430,932],[768,1024],[820,1180],[1024,768],[1366,768],[1920,1080],[2560,1440],[568,320],[844,390]];
 for(const [width,height] of views){
   await page.setViewportSize({width,height});
   const dimensions=await page.evaluate(()=>{const b=document.querySelector('#board').getBoundingClientRect();const sq=document.querySelector('.square').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,board:b.width,height:b.height,bottom:b.bottom,square:sq.width,squareHeight:sq.height};});
   assert(!dimensions.overflow,`${width}x${height} overflow`);assert(Math.abs(dimensions.board-dimensions.height)<1,`${width}x${height} square board`);
   assert(Math.abs(dimensions.square-dimensions.squareHeight)<1,`${width}x${height} square cells`);
   assert(dimensions.bottom<=height+2,`${width}x${height} board fits viewport (${dimensions.bottom})`);
   assert(dimensions.board>120,`${width}x${height} usable board`);
 }
 const profiles=await page.locator('.social-links a').evaluateAll(a=>a.map(x=>x.href));
 assert.deepEqual(profiles,['https://github.com/Raimal-Raja','https://www.linkedin.com/in/raimal-raja-kolhi-860a032bb/','https://www.instagram.com/professor_raimal/']);
 assert((await page.locator('.developer-credit').textContent()).includes('Data Scientist/ML Engineer Raimal Raja Kolhi'));
 await page.setViewportSize({width:320,height:568});
 await page.evaluate(()=>localStorage.setItem('chess-studio-game',JSON.stringify({version:2,moves:['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2'],config:{mode:'local',side:'white',level:2,seconds:1},flipped:false})));
 await page.reload();await page.tap('[data-square="b7"]');await page.tap('[data-square="a8"]');
 const dialog=await page.locator('#promotion').boundingBox();assert(dialog.x>=0&&dialog.x+dialog.width<=321);
 await page.click('#cancel-promotion');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.piece-image').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 if(process.env.CHESS_SCREENSHOT_DIR){for(const [name,width,height] of [['phone',390,844],['tablet',768,1024],['desktop',1366,900],['landscape',844,390]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(process.env.CHESS_SCREENSHOT_DIR,name+'.png'),fullPage:true});}}
 assert.equal(apiCalls,0);assert.deepEqual(errors,[]);
 console.log('PASS: 12 phone/tablet/desktop/landscape sizes, board fit, narrow promotion dialog, reduced motion, attribution and all social links. No gameplay API requests.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
