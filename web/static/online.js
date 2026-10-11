/* Cookie-based sessions: account tokens never enter localStorage. */
class RatedClient {
  constructor({onMatch, onClocks}) {
    this.onMatch = onMatch;
    this.onClocks = onClocks;
    this.profile = null;
    this.match = null;
    this.pollTimer = null;
    this.clockTimer = null;
    this.pending = false;this.emailCooldownUntil=0;
    this.message = document.getElementById('account-status');
    document.getElementById('account-github').onclick=()=>{try{sessionStorage.setItem('chess-rated-invite',new URL(location.href).searchParams.get('match')||document.getElementById('rated-code').value);}catch{}};
    document.getElementById('account-form').onsubmit = event => {event.preventDefault();this.authenticate('login');};
    document.getElementById('account-resend').onclick=()=>this.resendConfirmation();
    document.getElementById('account-signup').onclick = () => this.authenticate('signup');
    document.getElementById('account-logout').onclick = () => this.signOut();
    document.getElementById('rated-create').onclick = () => this.action(() => this.request('/matches', 'POST')).then(m => m && this.apply(m));
    document.getElementById('rated-join-form').onsubmit = event => {event.preventDefault();this.join(document.getElementById('rated-code').value.trim().toLowerCase());};
    document.getElementById('rated-copy').onclick = async () => {
      if (!this.match) return;
      const url = new URL(location.href);url.search='';url.hash='';url.searchParams.set('match',this.match.id);
      try {await navigator.clipboard.writeText(url.href);this.message.textContent='Invitation link copied.';}
      catch {this.message.textContent='Invitation code: '+this.match.id;}
    };
    document.getElementById('rated-resign').onclick = () => this.action(() => this.request('/matches/'+this.match.id+'/resign','POST')).then(m => m && this.apply(m));
    document.getElementById('rated-leaderboard').ontoggle = () => {if(document.getElementById('rated-leaderboard').open)this.leaderboard();};
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.match&&this.match.status!=='finished')this.poll();});
  }
  async request(path, method='GET', data=null, retry=true) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch('/rated'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:controller.signal,...(data?{body:JSON.stringify(data)}:{})});
      if(response.status===401&&retry&&!path.startsWith('/auth/')) {
        await this.request('/auth/refresh','POST',null,false);
        return this.request(path,method,data,false);
      }
      const body=await response.json().catch(()=>null);
      if(!response.ok){const e=Error(typeof body?.detail==='string'?body.detail:'Rated play is temporarily unavailable.');e.status=response.status;e.retryAfter=Number(response.headers.get('Retry-After'))||0;throw e;}
      return body;
    } catch(error){if(error.name==='AbortError')throw Error('The online service took too long. Please retry.');throw error;}
    finally {clearTimeout(timer);}
  }
  async init() {
    // Confirmation links may include tokens; discard them and require normal sign-in.
    if(location.hash.includes('access_token='))history.replaceState(null,'',location.pathname+location.search);

    try {
      const config=await this.request('/config');this.githubEnabled=config.github_enabled;
      if(!config.enabled){this.message.textContent='Online rated play needs Render settings: '+(config.missing_settings||[]).join(', ')+'.';return;}
      try {
        this.profile=await this.request('/me');
        await this.resume();
      } catch(error){if(error.status!==401)throw error;}
      this.renderAccount();
    } catch(error){this.message.textContent=error.message;}
  }
  renderAccount() {
    const signed=!!this.profile;
    document.getElementById('account-github').hidden=signed||!this.githubEnabled;
    document.getElementById('account-form').hidden=signed;
    document.getElementById('account-resend').hidden=signed;
    document.getElementById('rated-lobby').hidden=!signed;
    document.getElementById('rated-leaderboard').hidden=!signed;
    if(signed) {
      document.getElementById('account-rating').textContent='Elo '+this.profile.rating;
      document.getElementById('account-record').textContent=`${this.profile.games} rated games · ${this.profile.wins} wins · ${this.profile.draws} draws · ${this.profile.losses} losses`;
      this.message.textContent=this.profile.name+' · '+(this.profile.provisional?'Provisional Chess Studio Elo':'Chess Studio Elo');
    } else {
      document.getElementById('account-rating').textContent='Chess Studio Elo';
      this.message.textContent='Sign in or create an account to play rated opponents.';
    }
  }
  async action(fn) {
    if(this.pending)return null;
    this.pending=true;this.setButtons();
    try {return await fn();}
    catch(error){this.message.textContent=error.message;if(error.retryAfter)this.emailCooldown(error.retryAfter);return null;}
    finally {this.pending=false;this.setButtons();}
  }
  setButtons() {
    for(const id of ['rated-create','rated-resign','account-signup','account-logout'])document.getElementById(id).disabled=this.pending||(id==='rated-create'&&this.match&&!['finished','cancelled'].includes(this.match.status));
    document.getElementById('account-resend').disabled=this.pending||Date.now()<this.emailCooldownUntil;
    document.getElementById('account-signup').disabled=this.pending||Date.now()<this.emailCooldownUntil;
    for(const form of ['account-form','rated-join-form'])document.getElementById(form).querySelector('button[type="submit"]').disabled=this.pending;
  }
  async authenticate(kind) {
    const form=document.getElementById('account-form');if(!form.reportValidity())return;
    const email=document.getElementById('account-email').value.trim(),password=document.getElementById('account-password').value,name=document.getElementById('account-name').value.trim()||'Chess player';
    const result=await this.action(()=>this.request('/auth/'+kind,'POST',{email,password,name}));
    document.getElementById('account-password').value='';
    if(!result)return;
    if(!result.signed_in){this.message.textContent=result.message;if(result.retry_after)this.emailCooldown(result.retry_after);return;}
    try {this.profile=await this.request('/me');this.renderAccount();await this.resume();}
    catch(error){this.message.textContent=error.message;}
  }
  emailCooldown(seconds) {
    this.emailCooldownUntil=Date.now()+seconds*1000;clearInterval(this.emailTimer);
    const update=()=>{const remaining=Math.ceil((this.emailCooldownUntil-Date.now())/1000);document.getElementById('account-resend').textContent=remaining>0?'Resend available in '+remaining+'s':'Resend confirmation email';this.setButtons();if(remaining<=0)clearInterval(this.emailTimer);};
    update();this.emailTimer=setInterval(update,1000);
  }
  async resendConfirmation() {
    const input=document.getElementById('account-email');if(!input.reportValidity())return;
    const result=await this.action(()=>this.request('/auth/resend','POST',{email:input.value.trim()}));
    if(result){this.message.textContent=result.message;this.emailCooldown(result.retry_after);}
  }
  async resume() {
    let code=new URL(location.href).searchParams.get('match');
    try{code=code||sessionStorage.getItem('chess-rated-invite');sessionStorage.removeItem('chess-rated-invite');}catch{}
    if(code&&/^[a-f0-9]{12}$/i.test(code)){
      document.getElementById('rated-code').value=code.toLowerCase();
      this.message.textContent='Invitation ready. Use Join to enter the rated match.';
    }
    let saved;try{saved=localStorage.getItem('chess-rated-match');}catch{}
    code=this.profile?.current_match||saved;
    if(code){try{this.apply(await this.request('/matches/'+code));}catch(error){this.message.textContent=error.message;}}
  }
  async join(code) {
    if(!/^[a-f0-9]{12}$/.test(code)){this.message.textContent='Enter a 12-character invitation code.';return;}
    const match=await this.action(()=>this.request('/matches/'+code+'/join','POST'));
    if(match)this.apply(match);
  }
  apply(match) {
    if(this.match?.id===match.id) {
      if(match.state.moves.length<this.match.state.moves.length)return;
      if(['finished','cancelled'].includes(this.match.status)&&!['finished','cancelled'].includes(match.status))return;
    }
    this.match=match;
    this.profile=match.side==='white'?match.white:match.black;
    try{localStorage.setItem('chess-rated-match',match.id);}catch{}
    this.renderAccount();
    document.getElementById('rated-match').hidden=false;
    document.getElementById('rated-match-label').textContent=match.status==='waiting'?'Share invitation '+match.id+' · you play White':(match.white.name+' vs '+(match.black?.name||'Waiting player')+' · 10-minute rated game');
    document.getElementById('rated-copy').hidden=match.status!=='waiting';
    const done=['finished','cancelled'].includes(match.status);
    document.getElementById('rated-resign').hidden=done;
    document.getElementById('rated-resign').textContent=match.status==='waiting'?'Cancel invitation':'Resign rated match';
    document.getElementById('rated-create').disabled=!done;
    const delta=match.side==='white'?match.white_delta:-match.white_delta;
    document.getElementById('rated-result').textContent=match.status==='finished'?match.state.status+' · Elo '+(delta>=0?'+':'')+delta:'';
    this.receivedAt=performance.now();
    this.onMatch(match);
    clearInterval(this.clockTimer);this.clockTimer=setInterval(()=>this.showClocks(),1000);this.showClocks();
    clearTimeout(this.pollTimer);
    if(!done)this.pollTimer=setTimeout(()=>this.poll(),2000);
    else {clearInterval(this.clockTimer);this.clockTimer=null;}
  }
  clocks() {
    if(!this.match)return {white:600,black:600};
    const result={white:this.match.white_seconds,black:this.match.black_seconds};
    if(this.match.status==='active')result[this.match.clock_turn]=Math.max(0,result[this.match.clock_turn]-(performance.now()-this.receivedAt)/1000);
    return result;
  }
  showClocks() {
    const clocks=this.clocks();
    const format=seconds=>{const total=Math.ceil(Math.max(0,seconds));return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};
    for(const side of ['white','black'])document.getElementById('rated-'+side+'-clock').textContent=format(clocks[side]);
    this.onClocks?.(clocks);
  }
  async poll() {
    clearTimeout(this.pollTimer);
    const code=this.match?.id;if(!code)return;
    if(document.hidden||this.pending){this.pollTimer=setTimeout(()=>this.poll(),2000);return;}
    try{const match=await this.request('/matches/'+code);if(this.match?.id===code)this.apply(match);}
    catch(error){this.message.textContent=error.message;this.pollTimer=setTimeout(()=>this.poll(),5000);}
  }
  async move(move,ply) {
    const code=this.match?.id;if(!code)throw Error('Join a rated match first.');
    this.pending=true;this.setButtons();
    try {const result=await this.request('/matches/'+code+'/move','POST',{move,ply});if(this.match?.id===code)this.apply(result);}
    finally{this.pending=false;this.setButtons();}
  }
  leaveFinished() {
    if(this.match&&!['finished','cancelled'].includes(this.match.status))return false;
    this.match=null;clearTimeout(this.pollTimer);clearInterval(this.clockTimer);
    try{localStorage.removeItem('chess-rated-match');}catch{}
    document.getElementById('rated-match').hidden=true;
    return true;
  }
  async signOut() {
    if(this.match&&!['finished','cancelled'].includes(this.match.status)){this.message.textContent='Finish, resign or cancel your match before signing out.';return;}
    const result=await this.action(()=>this.request('/auth/logout','POST'));if(!result)return;
    this.leaveFinished();this.profile=null;this.renderAccount();
  }
  async leaderboard() {
    try {
      const rows=await this.request('/leaderboard'),list=document.getElementById('rated-leaders');list.replaceChildren();
      for(const row of rows){const li=document.createElement('li');li.textContent=row.name+' · '+row.rating+' Elo · '+row.games+' games';list.append(li);}
      if(!rows.length){const li=document.createElement('li');li.textContent='Complete a rated match to appear here.';list.append(li);}
    }catch(error){this.message.textContent=error.message;}
  }
}
