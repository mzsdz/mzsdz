const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// An isolated SDK fixture: no network, tokens, or real user accounts.
function fixtureClient(store, persist = () => {}) {
  let listener;
  const client = {
    auth: {
      getSession: async () => ({data:{session:store.user?{user:store.user}:null}}),
      onAuthStateChange: fn => { listener=fn; },
      signOut: async () => {store.user=null;persist();listener('SIGNED_OUT',null);return {};},
    },
    from(table) {
      let operation='read',payload,filters=[];
      const q={
        select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},
        maybeSingle(){return q.then(x=>({...x,data:x.data[0]||null}));},
        single(){return q.maybeSingle();},
        update(p){operation='update';payload=p;return q;},
        insert(p){operation='insert';payload=p;return q;},
        delete(){operation='delete';return q;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          let rows=table==='profiles'?[{id:'fixture-user',display_name:store.name}]:table==='article_reactions'?Object.values(store.reactions):table==='place_wishlist'?store.wishlist:table==='article_totals'?Object.entries(store.reactions).map(([id,r])=>({article_id:id,interest_count:+r.interested,like_count:+r.liked})):[];
          rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
          if(operation==='update'&&table==='profiles'){store.name=payload.display_name;rows=[{id:'fixture-user',display_name:store.name}];}
          if(operation==='insert'&&table==='place_wishlist'){store.wishlist.push({...payload,id:'fixture-'+Date.now(),created_at:new Date().toISOString()});rows=[];}
          if(operation==='delete'&&table==='place_wishlist'){store.wishlist=store.wishlist.filter(r=>!rows.includes(r));rows=[];}
          persist();return {data:JSON.parse(JSON.stringify(rows)),error:null};
        }).then(resolve,reject);}
      };return q;
    },
    async rpc(_name,p){const r=store.reactions[p.p_article_id]||{article_id:p.p_article_id,user_id:store.user.id,interested:false,liked:false};r[p.p_kind==='like'?'liked':'interested']=p.p_enabled;r.updated_at=new Date().toISOString();store.reactions[p.p_article_id]=r;persist();return {data:[{...r}],error:null};},
  };return client;
}
module.exports={fixtureClient};

async function run(){
  const store={user:{id:'fixture-user'},name:'테스트 독자',reactions:{},wishlist:[]};
  const client=fixtureClient(store),session=new Map();
  const window=new EventTarget();window.getSupabase=()=>client;
  const context={window,Event,setTimeout,clearTimeout,URL,console,sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},location:{pathname:'/',search:'',origin:'https://example.test'},document:{body:{dataset:{page:'feed'}},getElementById:id=>id==='memberToast'?{}:null}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/member-client.js'),'utf8'),context);
  const api=window.MemberClient;
  await api.init();await new Promise(r=>setTimeout(r,20));
  assert.equal(api.getState().profile.display_name,'테스트 독자');
  await Promise.all([api.setReaction('pyongyang','interest',true),api.setReaction('pyongyang','like',true)]);
  assert.equal(api.getState().reactions.pyongyang.interested,true);
  assert.equal(api.getState().reactions.pyongyang.liked,true);
  await api.setReaction('pyongyang','interest',true);
  assert.equal(api.getState().totals.pyongyang.interest_count,1);
  await api.toggleReaction('pyongyang','interest');
  assert.equal(api.getState().reactions.pyongyang.interested,false);
  assert.equal(api.getState().reactions.pyongyang.liked,true);
  await api.addPlace({name:'테스트 식당',map_url:'https://map.naver.com/p/entry/place/123',memo:'테스트 메모'});
  assert.equal(api.getState().wishlist.length,1);
  await assert.rejects(api.addPlace({name:'잘못된 링크',map_url:'javascript:alert(1)'}));
  await api.removePlace(api.getState().wishlist[0].id);
  assert.equal(api.getState().wishlist.length,0);
  await api.updateName('새 닉네임');assert.equal(api.getState().profile.display_name,'새 닉네임');
  for(const bad of ['//example.com','https://example.com','/\\evil.test','/me/../../external'])assert.equal(api.validReturn(bad),'/me');
  assert.equal(api.validReturn('/articles/pyongyang?view=gallery'),'/articles/pyongyang?view=gallery');
  await api.signOut();await new Promise(r=>setTimeout(r,20));
  assert.equal(api.getState().user,null);assert.equal(Object.keys(api.getState().reactions).length,0);assert.equal(api.getState().wishlist.length,0);
  console.log('PASS: isolated member client concurrent reactions, counts, wishlist, nickname, logout privacy and safe return paths.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
