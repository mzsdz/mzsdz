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
require('./render-editorial.cjs')({ root, origin, articles });
