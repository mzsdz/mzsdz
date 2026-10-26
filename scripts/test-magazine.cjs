const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const articles = JSON.parse(read('content/articles.json'));
for (const a of articles) {
  const html = read(`articles/${a.id}/index.html`);
  assert.ok(html.includes(`<h1>${a.title}</h1>`), 'Article must render without JavaScript');
  assert.ok(html.includes(`rel="canonical" href="https://www.mzsdz.com/articles/${a.id}"`));
  if (a.status === 'draft') {
    assert.ok(html.includes('noindex,follow'));
    assert.ok(html.includes('발행 전 기획 초안입니다.'));
    assert.ok(!read('sitemap.xml').includes(`/articles/${a.id}`));
    assert.ok(!read('magazine.xml').includes(`/articles/${a.id}`));
    assert.ok(!html.includes('application/ld+json'));
  }
}
const home = read('index.html');
const originalCSS = read('magazine/template.html').split('<style>')[1].split('</style>')[0];
assert.ok(read('magazine/style.css').startsWith(originalCSS), 'Preserve the approved prototype CSS');
assert.ok(home.includes('href="/list"'));
assert.ok(!home.includes('#/article/'));
assert.ok(!read('dist/index.html').includes('프로토타입'));
assert.ok(fs.existsSync(path.join(root, 'dist/list.html')));
assert.equal(read('dist/places.js'), read('places.js'));
for (const js of ['js/auth-return.js', 'js/magazine.js']) new vm.Script(read(js));
function redirect(search, hash) {
  let target = null;
  vm.runInNewContext(read('js/auth-return.js'), { URLSearchParams, location: { search, hash, replace: url => { target = url; } } });
  return target;
}
assert.equal(redirect('?code=pkce-test', ''), '/list?code=pkce-test');
assert.equal(redirect('', '#access_token=example&refresh_token=example&type=magiclink'), '/list#access_token=example&refresh_token=example&type=magiclink');
assert.equal(redirect('?q=test', ''), '/list?q=test');
assert.equal(redirect('?tag=맛의%20기준', ''), null);
assert.equal(redirect('', '#/article/pyongyang'), null);
assert.equal(redirect('?error_description=cancelled', ''), '/list?error_description=cancelled');
assert.ok(read('js/place-social.js').includes('return window.location.origin + "/";'));
console.log('PASS: original prototype CSS preserved; article HTML, canonical URLs, draft exclusion, deployment assets and auth callbacks.');
// Exercise publication and withdrawal in an isolated fixture, without publishing sample claims.
const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mzsdz-publish-'));
try {
  for (const file of ['scripts/build-magazine.cjs', 'magazine/template.html', 'content/articles.json', 'list.html', 'places.js', 'js', 'favicon.svg', 'robots.txt', 'rss.xml', 'naver621a83f766e979127bfc0e9ce86265b8.html']) {
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.cpSync(path.join(root, file), path.join(temp, file), { recursive: true });
  }
  const fixture = [{ ...articles[0], status: 'published', publishedAt: '2026-10-26', sources: [{ title: 'Test source', url: 'https://example.com/source' }] }];
  const dataPath = path.join(temp, 'content/articles.json');
  const run = () => require('node:child_process').execFileSync(process.execPath, [path.join(temp, 'scripts/build-magazine.cjs')], { stdio: 'pipe' });
  fs.writeFileSync(dataPath, JSON.stringify(fixture)); run();
  const output = file => fs.readFileSync(path.join(temp, file), 'utf8');
  assert.ok(output('sitemap.xml').includes('/articles/pyongyang'));
  assert.ok(output('magazine.xml').includes('<item>'));
  assert.ok(output('articles/pyongyang/index.html').includes('application/ld+json'));
  fixture[0].status = 'draft'; fs.writeFileSync(dataPath, JSON.stringify(fixture)); run();
  assert.ok(!output('sitemap.xml').includes('/articles/pyongyang'));
  assert.ok(output('articles/pyongyang/index.html').includes('noindex,follow'));
  fs.writeFileSync(dataPath, '[]'); run();
  assert.ok(!fs.existsSync(path.join(temp, 'dist/articles/pyongyang')));
  console.log('PASS: publishing adds SEO/feed entries; reverting to draft removes indexing; deletion removes generated pages.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
