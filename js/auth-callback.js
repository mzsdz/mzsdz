(() => {
  const status=document.getElementById('callbackStatus');
  async function run(){const client=window.getSupabase?.();if(!client){status.textContent='로그인 서비스를 불러오지 못했습니다. 새로고침해 주세요.';return;}
    const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
    if(query.has('error')||hash.has('error')){status.textContent='로그인이 취소되었거나 링크가 만료되었습니다. 내 매거진에서 다시 로그인해 주세요.';history.replaceState(null,'','/auth/callback');return;}
    const {data,error}=await client.auth.getSession();
    if(error||!data.session){status.textContent='로그인을 완료하지 못했습니다. 최신 이메일 링크를 사용하거나 다시 로그인해 주세요.';history.replaceState(null,'','/auth/callback');return;}
    let path='/me';try{path=sessionStorage.getItem('mzsdz.auth.return')||'/me';sessionStorage.removeItem('mzsdz.auth.return');}catch{}
    path=window.MemberClient?.validReturn(path)||'/me';location.replace(path);
  }
  run().catch(()=>{status.textContent='로그인 상태를 확인하지 못했습니다. 내 매거진에서 다시 시도해 주세요.';});
})();
