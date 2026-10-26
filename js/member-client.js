(() => {
  const state = { user: null, profile: null, reactions: {}, totals: {}, wishlist: [], ready: false, totalsReady: false, totalsError: false, error: null };
  let client, initialization, epoch = 0, lastFocus = 0, accountSequence = 0, totalsSequence = 0;
  const busy = new Set();
  const emit = () => window.dispatchEvent(new Event('member-change'));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storage = { get(key) { try { return sessionStorage.getItem(key); } catch { return null; } }, set(key,value) { try { sessionStorage.setItem(key,value); } catch {} }, remove(key) { try { sessionStorage.removeItem(key); } catch {} } };
  const message = error => error?.code === '23505' ? '이미 등록되어 있거나 사용 중인 이름입니다.' : error?.code === '42501' ? '로그인 상태와 접근 권한을 확인해 주세요.' : '저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
  function notify(text) { let el=document.getElementById('memberToast'); if(!el){el=document.createElement('div');el.id='memberToast';el.className='member-toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=text;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,5000); }
  function validReturn(path) { return typeof path==='string' && /^\/(?:me(?:\?.*)?|articles\/[a-z0-9-]+(?:\?.*)?|list(?:\?.*)?|\?.*)?$/.test(path) ? path : '/me'; }
  function rememberReturn(path = location.pathname + location.search) { storage.set('mzsdz.auth.return', validReturn(path)); }
  function dialog() {
    let el=document.getElementById('memberDialog');if(el)return el;
    el=document.createElement('dialog');el.id='memberDialog';el.className='member-dialog';
    el.innerHTML='<form method="dialog" class="member-close-row"><button class="member-close" aria-label="가입·로그인 창 닫기">×</button></form><div class="member-dialog-body"><h2>가입 · 로그인</h2><p>관심 있는 글과 좋아요, 가고 싶은 맛집을<br>내 매거진에 모아보세요.</p><button type="button" id="memberGoogle" class="member-primary">Google로 계속하기</button><div class="member-divider">또는 이메일로</div><form id="memberEmailForm"><label for="memberEmail">이메일</label><input id="memberEmail" type="email" required autocomplete="email" placeholder="이메일 주소"><button class="member-primary" type="submit">로그인 링크 받기</button></form><p class="member-fine">처음 이용하면 계정이 함께 만들어집니다.<br>이메일로 받은 링크를 누르면 로그인됩니다.</p><p id="memberAuthStatus" class="member-form-status" role="status"></p></div>';
    document.body.append(el);
    el.addEventListener('close',()=>{if(!state.user)storage.remove('mzsdz.member.pending');});
    el.addEventListener('click',event=>{if(event.target===el){const rect=el.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)el.close();}});
    el.querySelector('#memberGoogle').onclick=async()=>{ const b=el.querySelector('#memberGoogle'), status=el.querySelector('#memberAuthStatus');b.disabled=true;status.textContent='로그인 페이지로 이동합니다…';const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}});if(error){status.textContent='Google 로그인을 시작하지 못했습니다. 이메일 로그인을 이용해 주세요.';b.disabled=false;} };
    el.querySelector('#memberEmailForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,b=form.querySelector('button'),status=el.querySelector('#memberAuthStatus');if(!form.reportValidity())return;b.disabled=true;status.textContent='로그인 링크를 보내는 중입니다…';try{const {error}=await client.auth.signInWithOtp({email:el.querySelector('#memberEmail').value.trim(),options:{shouldCreateUser:true,emailRedirectTo:location.origin+'/'}});status.textContent=error?'메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.':'메일함을 확인해 주세요. 링크를 누르면 가입·로그인이 완료됩니다.';}catch{status.textContent='연결 상태를 확인하고 다시 시도해 주세요.';}finally{b.disabled=false;}};
    return el;
  }
  async function openLogin(returnTo) { await init();if(!client){notify('로그인 서비스를 불러오지 못했습니다. 새로고침해 주세요.');return;}rememberReturn(returnTo);const el=dialog();el.querySelector('#memberAuthStatus').textContent='';if(!el.open)el.showModal(); }
  async function refreshTotals() { if(!client)return;const version=++totalsSequence;const {data,error}=await client.from('article_totals').select('article_id,interest_count,like_count');if(version!==totalsSequence)return;if(error){state.totalsReady=false;state.totalsError=true;emit();return;}state.totalsError=false;state.totals=Object.fromEntries((data||[]).map(r=>[r.article_id,r]));state.totalsReady=true;emit(); }
  async function loadAccount(version) {
    const uid=state.user?.id;const request=++accountSequence;
    if(!uid){state.profile=null;state.reactions={};state.wishlist=[];state.ready=true;state.error=null;emit();return;}
    const results=await Promise.all([
      client.from('profiles').select('id,display_name').eq('id',uid).maybeSingle(),
      client.from('article_reactions').select('article_id,interested,liked,updated_at').eq('user_id',uid),
      client.from('place_wishlist').select('id,place_sid,name,address,map_url,memo,created_at').eq('user_id',uid).order('created_at',{ascending:false})
    ]);
    if(version!==epoch||request!==accountSequence||state.user?.id!==uid)return;
    state.profile=results[0].data;
    state.reactions=Object.fromEntries((results[1].data||[]).map(r=>[r.article_id,r]));
    state.wishlist=results[2].data||[];state.ready=true;
    state.error=results.some(r=>r.error)?'저장 목록을 불러오지 못했습니다. 다시 불러와 주세요.':null;emit();
    if(state.error || document.body.dataset.page==='callback')return;
    document.getElementById('memberDialog')?.close();
    const pending=storage.get('mzsdz.member.pending');storage.remove('mzsdz.member.pending');
    if(pending){try{const action=JSON.parse(pending);if(action.type==='reaction')await setReaction(action.article,action.kind,true);else if(action.type==='place')await addPlace(action.place);}catch{notify('이전 저장 요청을 완료하지 못했습니다. 다시 눌러 주세요.');}}
  }
  function acceptSession(session) { const next=session?.user||null;const changed=state.user?.id!==next?.id;state.user=next;if(changed){epoch++;state.ready=false;state.profile=null;state.reactions={};state.wishlist=[];state.error=null;emit();}const version=epoch;setTimeout(()=>{loadAccount(version).catch(()=>{if(version===epoch){state.ready=true;state.error='저장 목록을 불러오지 못했습니다.';emit();}});},0); }
  async function init() {
    if(initialization)return initialization;
    initialization=(async()=>{client=window.getSupabase?.();if(!client){state.ready=true;state.error='로그인 서비스를 불러오지 못했습니다.';emit();return;}
      client.auth.onAuthStateChange((_event,session)=>acceptSession(session));
      const {data,error}=await client.auth.getSession();if(error)notify('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');acceptSession(data.session);await refreshTotals();
      window.addEventListener('focus',()=>{if(Date.now()-lastFocus<10000)return;lastFocus=Date.now();refreshTotals();loadAccount(epoch).catch(()=>{});});
    })();return initialization;
  }
  async function setReaction(article,kind,enabled) {
    await init();if(!/^[a-z0-9-]{1,64}$/.test(article)||!['interest','like'].includes(kind))return;
    if(!state.user){storage.set('mzsdz.member.pending',JSON.stringify({type:'reaction',article,kind}));await openLogin();return false;}
    const token=article+':'+kind;if(busy.has(token))return false;busy.add(token);emit();
    const uid=state.user.id;accountSequence++;
    try{const {data,error}=await client.rpc('set_article_reaction',{p_article_id:article,p_kind:kind,p_enabled:enabled});if(error)throw error;if(state.user?.id===uid){state.reactions[article]={...state.reactions[article],[kind==='like'?'liked':'interested']:data?.[0]?.[kind==='like'?'liked':'interested']??enabled,updated_at:new Date().toISOString()};await refreshTotals();emit();}return true;}catch(error){notify(message(error));return false;}finally{busy.delete(token);emit();}
  }
  function normalizePlace(input) {
    const p={name:String(input.name||'').trim(),address:String(input.address||'').trim(),memo:String(input.memo||'').trim(),place_sid:input.place_sid?String(input.place_sid):null,map_url:String(input.map_url||'').trim()||null};
    if(!p.name||p.name.length>120||p.address.length>240||p.memo.length>500)throw Error('가게 이름과 입력 길이를 확인해 주세요.');
    if(p.place_sid&&!/^\d{1,30}$/.test(p.place_sid))throw Error('가게 번호가 올바르지 않습니다.');
    if(p.map_url){let url;try{url=new URL(p.map_url);}catch{throw Error('지도 링크를 확인해 주세요.');}if(url.protocol!=='https:'||!['map.naver.com','naver.me','maps.app.goo.gl','place.map.kakao.com'].includes(url.hostname)||url.username||url.password)throw Error('네이버·카카오·구글 지도 링크를 입력해 주세요.');}
    return p;
  }
  async function addPlace(input) {
    const place=normalizePlace(input);await init();
    if(!state.user){storage.set('mzsdz.member.pending',JSON.stringify({type:'place',place}));await openLogin('/me?tab=places');return false;}
    const uid=state.user.id;const {error}=await client.from('place_wishlist').insert({...place,user_id:uid});
    if(error&&error.code!=='23505')throw Error(message(error));
    await loadAccount(epoch);notify(error?'이미 가고 싶은 맛집에 등록되어 있습니다.':'가고 싶은 맛집에 등록했습니다.');return true;
  }
  async function removePlace(id) { await init();if(!state.user)return false;const {error}=await client.from('place_wishlist').delete().eq('id',id).eq('user_id',state.user.id);if(error)throw Error(message(error));state.wishlist=state.wishlist.filter(p=>p.id!==id);emit();return true; }
  async function updateName(name) { name=name.trim();if(name.length<2||name.length>24)throw Error('닉네임은 2~24자로 입력해 주세요.');if(!state.user)throw Error('먼저 로그인해 주세요.');const {data,error}=await client.from('profiles').update({display_name:name}).eq('id',state.user.id).select('id,display_name').single();if(error)throw Error(message(error));state.profile=data;emit(); }
  async function signOut() {const {error}=await client.auth.signOut();if(error)throw Error('로그아웃하지 못했습니다. 다시 시도해 주세요.');}
  function toggleReaction(article,kind) { const field=kind==='interest'?'interested':'liked';return setReaction(article,kind,!state.reactions[article]?.[field]); }
  window.MemberClient={init,openLogin,refresh:()=>loadAccount(epoch),refreshTotals,setReaction,toggleReaction,addPlace,removePlace,updateName,signOut,notify,validReturn,isBusy:(id,kind)=>busy.has(id+':'+kind),getState:()=>state};
  init();
})();
