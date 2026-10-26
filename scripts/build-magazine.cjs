const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.mzsdz.com';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const xml = esc;
const template = read('magazine/template.html');
const articles = JSON.parse(read('content/articles.json'));
const ids = new Set();
for (const a of articles) {
  if (!/^[a-z0-9-]+$/.test(a.id) || ids.has(a.id)) throw Error('Invalid/duplicate article ID');
  ids.add(a.id);
  if (!['draft', 'published'].includes(a.status)) throw Error('Invalid article status');
  if (!a.title || !a.desc || !Array.isArray(a.paras) || !a.paras.length || !Array.isArray(a.tags)) throw Error('Incomplete article');
  if (a.status === 'published' && (!/^\d{4}-\d{2}-\d{2}$/.test(a.publishedAt || '') || !a.sources?.length)) throw Error('Published articles require date and verified source links');
  for (const source of a.sources || []) if (!/^https:\/\//.test(source.url) || !source.title) throw Error('Invalid source');
}
const categories = [...new Set(['전체', '입문 가이드', '가격의 비밀', '맛의 기준', '혀 과학', '식당 이야기', ...articles.flatMap(a => a.tags)])];
let css = template.split('<style>')[1].split('</style>')[0];
css += '\n@media(max-width:760px){.topics{margin-right:0}}[hidden]{display:none!important}.top-actions a{padding:8px 10px;font-size:13px;font-weight:650;color:#63665f;border-radius:6px}.top-actions a.active,.top-actions a:hover{background:#efeee9;color:var(--ink)}.draft-badge{font-size:10px;color:var(--accent);border:1px solid #e8b2a5;border-radius:4px;padding:2px 5px;white-space:nowrap}.status-note{font-size:12px;color:var(--muted);min-height:1.5em}.feature-art{isolation:isolate}.skip-link{position:fixed;top:-80px;left:12px;z-index:99;background:white;padding:12px}.skip-link:focus{top:10px}@media(max-width:760px){.top-actions a{font-size:12px;padding:7px 8px}}@media(max-width:400px){.top-actions a{padding:7px 5px}}';
write('magazine/style.css', css);
const header = `<a class="skip-link" href="#mainContent">본문으로 바로 가기</a><header class="topbar"><div class="shell topbar-inner"><a class="brand" href="/" aria-label="맛집신동진 매거진 홈">맛집<em>신동진</em></a><nav class="top-actions" aria-label="주요 메뉴"><a id="navMagazine" class="active" href="/">매거진</a><a id="navSaved" href="/?saved=1">저장한 글</a><a id="navList" href="/list">맛집 리스트 ↗</a></nav></div></header>`;
const footer = `<footer class="shell bottom"><span><strong>맛집신동진</strong> · 먹는 것에 관한 매거진</span><span>초안은 취재·사실 확인 전 기획입니다.</span></footer>`;
function page(title, desc, url, body, draft = false, schema = null) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f9f8f4"><script src="/js/auth-return.js"></script><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${origin}${url}"><meta name="robots" content="${draft ? 'noindex,follow' : 'index,follow'}"><meta property="og:type" content="${url.startsWith('/articles/') ? 'article' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${origin}${url}"><meta property="og:site_name" content="맛집신동진"><meta property="og:locale" content="ko_KR"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="alternate" type="application/rss+xml" title="맛집신동진 매거진" href="/magazine.xml"><link rel="stylesheet" href="/magazine/style.css">${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}<script defer src="/js/magazine.js"></script><script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script defer src="/js/supabase-client.js"></script><script defer src="/js/site-visits.js"></script><script defer src="/_vercel/insights/script.js"></script></head><body>${header}<main id="mainContent">${body}</main>${footer}</body></html>`;
}
const badge = a => a.status === 'draft' ? '<span class="draft-badge">기획 초안</span>' : `<time datetime="${a.publishedAt}">${a.publishedAt}</time>`;
const cover = (a, feature = false) => `<div class="${feature ? 'feature-art' : 'cover'} color-${esc(a.color)}" aria-hidden="true"><span class="cover-label">${esc(a.short)}</span></div>`;
const save = (a, large = false) => `<button type="button" class="${large ? 'action-btn' : 'bookmark'}" data-save="${a.id}" data-title="${esc(a.title)}" aria-label="글 저장: ${esc(a.title)}" aria-pressed="false">${large ? '♡ 이 글 저장' : '♡'}</button>`;
const attrs = a => `data-story data-article-id="${a.id}" data-tags="${esc(JSON.stringify(a.tags))}"`;
const feature = articles.find(a => a.feature);
const featureHTML = feature ? `<div class="feature" ${attrs(feature)}><div class="feature-copy"><div class="label">FEATURED STORY · ${feature.status === 'draft' ? '기획 초안' : 'ARTICLE'}</div><h3><a href="/articles/${feature.id}">${esc(feature.title)}</a></h3><p>${esc(feature.desc)}</p><a class="side-link" href="/articles/${feature.id}">이야기 읽기 →</a></div>${cover(feature, true)}</div>` : '';
const cards = articles.filter(a => a !== feature).map(a => `<div class="story" ${attrs(a)}><a href="/articles/${a.id}" aria-label="${esc(a.title)} 열기">${cover(a)}</a><div class="story-main"><div class="story-topline">${esc(a.category)}<span class="dot">·</span>${badge(a)}</div><h3><a href="/articles/${a.id}">${esc(a.title)}</a></h3><p class="desc">${esc(a.desc)}</p></div>${save(a)}</div>`).join('');
let sidebar = template.split('<aside class="side">')[1].split('</aside>')[0];
sidebar = sidebar.replace('그동안 모은 식당 목록은 사라지지 않습니다. 개편 후에는 /list에서 만날 수 있어요.', '그동안 모은 식당 목록. 검색·별점·지역·종류 필터로 찾아보세요.').replace('곳 · 확인 시점 기준', '곳 · 개편 시점 기준').replaceAll('href="#/list"', 'href="/list"').replaceAll('href="#/article/', 'href="/articles/');
const intro = template.split('<section class="shell intro">')[1].split('</section>')[0];
const body = `<section class="shell intro">${intro}</section><section class="topics-section"><div class="shell topics" role="group" aria-label="기사 주제 필터" id="topics">${categories.map(c => `<button type="button" class="topic ${c === '전체' ? 'active' : ''}" data-category="${esc(c)}" aria-pressed="${c === '전체'}">${esc(c)}</button>`).join('')}</div></section><div class="shell content-layout"><section><div class="section-top"><h2 id="feedHeading">새로운 이야기</h2><span id="feedCount">${articles.length}개 이야기</span></div><div id="featureContainer">${featureHTML}</div><div class="story-list" id="stories">${cards}</div><div id="feedEmpty" class="empty" hidden>조건에 맞는 이야기가 없어요.<br><span class="mini-placeholder">다른 주제를 선택하거나 마음에 드는 글을 저장해 보세요.</span></div><p class="status-note" id="magazineStatus" role="status" aria-live="polite"></p><p class="mini-placeholder">저장한 글은 이 브라우저에 보관됩니다.</p></section><aside class="side">${sidebar}</aside></div>`;
write('index.html', page('맛집신동진 — 먹는 것에 관한 이야기', '먹는 것에 관한 모든 궁금증. 더 맛있게 먹기 위해 음식의 차이와 이유를 묻습니다.', '/', body));
// This directory contains only generated article pages; remove stale/unpublished URLs.
fs.rmSync(path.join(root, 'articles'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'articles'), { recursive: true });
for (const a of articles) {
  const draft = a.status === 'draft';
  const articleBody = `<div class="shell content-layout"><article data-article-id="${a.id}"><a class="backlink" href="/">← 모든 이야기</a><div class="page-header"><span class="small-label">${esc(a.category)} · ${draft ? 'EDITORIAL CONCEPT' : 'ARTICLE'}</span><h1>${esc(a.title)}</h1><p>${esc(a.desc)}</p><div class="mini-placeholder">맛집신동진 · ${draft ? '발행 전 기획 초안' : esc(a.publishedAt)}</div></div><div class="article-cover color-${esc(a.color)}"><span class="cover-label">${esc(a.short)}</span></div>${draft ? '<div class="draft-note"><strong>발행 전 기획 초안입니다.</strong> 사실 확인·취재·편집을 거친 완성 기사가 아닙니다. 예시 내용과 가설이 포함되어 있습니다.</div>' : ''}<div class="article-body">${a.paras.map(p => `<h2>${esc(p[0])}</h2><p>${esc(p[1])}</p>`).join('')}${a.sources?.length ? `<h2>참고 자료</h2><ul>${a.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul>` : ''}</div><div class="article-actions">${save(a, true)}<button type="button" class="action-btn" id="copyArticle">링크 복사</button></div><p class="status-note" id="magazineStatus" role="status" aria-live="polite"></p><a class="backlink" href="/">← 다른 이야기 읽기</a></article><aside class="side"><div class="side-block"><div class="side-title">맛집신동진</div><h3>호기심이 식탁을 바꿉니다.</h3><p>한 편을 읽고 나면 다음 한 끼가 달라지도록.</p><a class="side-link" href="/list">맛집 리스트 보기 →</a></div></aside></div>`;
  const schema = draft ? null : { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.desc, datePublished: a.publishedAt, author: { '@type': 'Organization', name: '맛집신동진' }, mainEntityOfPage: origin + '/articles/' + a.id };
  write(`articles/${a.id}/index.html`, page(a.title + ' | 맛집신동진' + (draft ? ' · 기획 초안' : ''), a.desc, '/articles/' + a.id, articleBody, draft, schema));
}
const published = articles.filter(a => a.status === 'published');
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/list', ...published.map(a => '/articles/' + a.id)].map(url => `<url><loc>${origin}${url}</loc></url>`).join('')}</urlset>`);
write('magazine.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>맛집신동진 매거진</title><link>${origin}/</link><description>먹는 것에 관한 이야기. 초안은 발행 피드에 포함하지 않습니다.</description><language>ko-kr</language>${published.map(a => `<item><title>${xml(a.title)}</title><link>${origin}/articles/${a.id}</link><guid>${origin}/articles/${a.id}</guid><description>${xml(a.desc)}</description><pubDate>${new Date(a.publishedAt + 'T00:00:00+09:00').toUTCString()}</pubDate></item>`).join('')}</channel></rss>`);
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of ['index.html', 'list.html', 'places.js', 'js', 'articles', 'favicon.svg', 'robots.txt', 'rss.xml', 'magazine.xml', 'sitemap.xml', 'naver621a83f766e979127bfc0e9ce86265b8.html']) fs.cpSync(path.join(root, file), path.join(out, file), { recursive: true });
fs.mkdirSync(path.join(out, 'magazine'), { recursive: true });
fs.copyFileSync(path.join(root, 'magazine/style.css'), path.join(out, 'magazine/style.css'));
console.log(`Built magazine: ${articles.length} articles (${published.length} published), preserved restaurant list.`);
