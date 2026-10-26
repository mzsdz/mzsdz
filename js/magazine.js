(() => {
  const key = 'mzsdz-magazine-saved';
  const valid = new Set([...document.querySelectorAll('[data-article-id]')].map(el => el.dataset.articleId));
  let saved = new Set();
  let persistent = true;
  try {
    const data = JSON.parse(localStorage.getItem(key) || localStorage.getItem('mzsdz-mag-demo-saved') || '[]');
    if (Array.isArray(data)) saved = new Set(data.filter(id => typeof id === 'string'));
  } catch { persistent = false; }
  let category = new URLSearchParams(location.search).get('tag') || '전체';
  let savedOnly = new URLSearchParams(location.search).get('saved') === '1';
  const status = document.getElementById('magazineStatus');
  function notify(message) { if (status) status.textContent = message; }
  function render() {
    const cards = [...document.querySelectorAll('[data-story]')];
    let count = 0;
    for (const card of cards) {
      const show = (category === '전체' || JSON.parse(card.dataset.tags).includes(category)) && (!savedOnly || saved.has(card.dataset.articleId));
      card.hidden = !show;
      if (show) count++;
    }
    for (const button of document.querySelectorAll('[data-save]')) {
      const on = saved.has(button.dataset.save);
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('saved', on);
      button.classList.toggle('on', on);
      button.textContent = button.classList.contains('bookmark') ? (on ? '♥' : '♡') : (on ? '♥ 저장됨' : '♡ 이 글 저장');
      button.setAttribute('aria-label', `${on ? '저장 취소' : '글 저장'}: ${button.dataset.title}`);
    }
    for (const button of document.querySelectorAll('[data-category]')) {
      const on = button.dataset.category === category;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    }
    const heading = document.getElementById('feedHeading');
    if (heading) heading.textContent = savedOnly ? '저장한 이야기' : '새로운 이야기';
    const counter = document.getElementById('feedCount');
    if (counter) counter.textContent = `${count}개 이야기`;
    const empty = document.getElementById('feedEmpty');
    if (empty) empty.hidden = count !== 0;
    document.getElementById('navSaved')?.classList.toggle('active', savedOnly);
    document.getElementById('navMagazine')?.classList.toggle('active', !savedOnly);
  }
  function updateURL() {
    const url = new URL(location.href);
    category === '전체' ? url.searchParams.delete('tag') : url.searchParams.set('tag', category);
    savedOnly ? url.searchParams.set('saved', '1') : url.searchParams.delete('saved');
    history.replaceState(null, '', url);
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-save]');
    if (button && valid.has(button.dataset.save)) {
      const id = button.dataset.save;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      try { localStorage.setItem(key, JSON.stringify([...saved])); } catch { persistent = false; }
      render();
      notify(persistent ? '이 브라우저의 저장 목록을 변경했습니다.' : '브라우저 저장이 차단되어 이 화면에서만 유지됩니다.');
    }
    const topic = event.target.closest('[data-category]');
    if (topic) { category = topic.dataset.category; updateURL(); render(); }
    const nav = event.target.closest('#navSaved, #navMagazine');
    if (nav && document.getElementById('stories')) {
      event.preventDefault(); savedOnly = nav.id === 'navSaved'; category = '전체'; updateURL(); render();
    }
    if (event.target.closest('#copyArticle')) {
      try { await navigator.clipboard.writeText(location.origin + location.pathname); notify('기사 주소를 복사했습니다.'); }
      catch { notify('주소창의 기사 주소를 복사해 주세요.'); }
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    try { const data = JSON.parse(event.newValue || '[]'); saved = new Set(Array.isArray(data) ? data.filter(x => typeof x === 'string') : []); render(); } catch {}
  });
  // Preserve URLs shared from the original prototype.
  if (location.hash.startsWith('#/article/')) {
    const id = location.hash.slice('#/article/'.length);
    if (/^[a-z0-9-]+$/.test(id)) location.replace('/articles/' + id);
  } else if (location.hash === '#/list') location.replace('/list');
  render();
})();
