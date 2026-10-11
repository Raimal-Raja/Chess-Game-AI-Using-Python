const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHESS_CHROMIUM_PATH?{executablePath:process.env.CHESS_CHROMIUM_PATH}:{})});
 const a=await browser.newContext(),b=await browser.newContext(),white=await a.newPage(),black=await b.newPage();
 const errors=[];let engines=0;
 for(const page of [white,black]){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/engine/'))engines++;});await page.goto(process.env.CHESS_RATED_TEST_URL||'http://127.0.0.1:8766');await page.waitForSelector('#account-form:not([hidden])');}
 await white.route('**/rated/auth/resend',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:'Confirmation requested.',retry_after:60})}));
 await white.fill('#account-email','white@example.test');await white.click('#account-resend');
 await white.waitForFunction(()=>document.querySelector('#account-resend').disabled&&document.querySelector('#account-resend').textContent.includes('60s'));
 await white.unroute('**/rated/auth/resend');
 console.log('PASS: confirmation resend requires only email and shows a cooldown.');
 for(const [page,email] of [[white,'white@example.test'],[black,'black@example.test']]){
   await page.fill('#account-email',email);await page.fill('#account-password','password123');await page.locator('#account-form button[type="submit"]').click();await page.waitForSelector('#rated-lobby:not([hidden])');
   assert((await page.locator('#account-rating').textContent()).includes('1200'));
   assert(!(await page.evaluate(()=>document.cookie)).includes('chess_access'));
 }
 await white.click('#rated-create');await white.waitForFunction(()=>document.querySelector('#status').textContent==='Waiting for another player');
 const code=await white.evaluate(()=>localStorage.getItem('chess-rated-match'));
 await black.fill('#rated-code',code);await black.locator('#rated-join-form button[type="submit"]').click();
 await white.waitForFunction(()=>document.querySelector('#status').textContent==='White to move',{}, {timeout:15000});
 assert(await white.locator('#analyse').isDisabled());assert(await white.locator('#undo').isDisabled());
 assert.equal(await black.locator('#board button').first().getAttribute('data-square'),'h1');
 for(const [page,from,to,turn] of [[white,'f2','f3','Black to move'],[black,'e7','e5','White to move'],[white,'g2','g4','Black to move'],[black,'d8','h4','Black wins']]){
   await page.click(`[data-square="${from}"]`);
   if(from==='e7'){await page.waitForTimeout(2600);assert(await page.locator('[data-square="e7"]').evaluate(e=>e.classList.contains('selected')));}
   await page.click(`[data-square="${to}"]`);
   for(const viewer of [white,black])await viewer.waitForFunction(t=>document.querySelector('#status').textContent.includes(t),turn,{timeout:15000});
 }
 assert((await white.locator('#account-rating').textContent()).includes('1184'));
 assert((await black.locator('#account-rating').textContent()).includes('1216'));
 assert((await white.locator('#account-record').textContent()).includes('1 rated games'));
 const download=white.waitForEvent('download');await white.click('#export');assert.equal((await download).suggestedFilename(),'chess-studio.pgn');
 await white.reload();await white.waitForFunction(()=>document.querySelector('#account-rating').textContent.includes('1184'));
 assert((await white.locator('#account-record').textContent()).includes('1 rated games'));
 await white.click('#rated-create');await white.waitForFunction(()=>document.querySelector('#status').textContent==='Waiting for another player');
 const second=await white.evaluate(()=>localStorage.getItem('chess-rated-match'));
 await black.fill('#rated-code',second);await black.locator('#rated-join-form button[type="submit"]').click();
 await white.waitForFunction(()=>document.querySelector('#status').textContent==='White to move',{}, {timeout:15000});
 await black.click('#rated-resign');
 await white.waitForFunction(()=>document.querySelector('#status').textContent.includes('resignation'),{}, {timeout:15000});
 assert((await white.locator('#account-rating').textContent()).includes('1201'));
 assert((await black.locator('#account-rating').textContent()).includes('1199'));
 await white.locator('#rated-leaderboard summary').click();await white.waitForFunction(()=>document.querySelectorAll('#rated-leaders li').length===2);
 await black.click('#account-logout');await black.waitForSelector('#account-form:not([hidden])');
 assert.equal(engines,0);assert.deepEqual(errors,[]);
 console.log('PASS: independent account cookies, live two-player sync, stable selection while polling, clocks, assistance lock, checkmate Elo, reload persistence, resignation Elo, PGN, leaderboard and sign-out.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
