const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const original = require('node:child_process').execFileSync('git', ['show', '9dae28bd996ba26d41f39bef7851adea0f071347:index.html'], { cwd: root, encoding: 'utf8' });
const listing = read('list.html');
const inlineScripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(match => !/\bsrc=/.test(match[1]) && !/ld\+json/.test(match[1])).map(match => match[2].replace(/\r\n/g, '\n'));
assert.deepEqual(inlineScripts(listing), inlineScripts(original), 'List application logic must remain identical');
for (const script of inlineScripts(listing)) new vm.Script(script);
for (const match of listing.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  const src = match[1];
  if (src.startsWith('https:') || src.startsWith('/_vercel/')) continue;
  assert.ok(src.startsWith('/'), `Asset must support both /list and /list/: ${src}`);
  assert.ok(fs.existsSync(path.join(root, src)), `Missing asset ${src}`);
}
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(ids(listing), ids(original), 'Search, filter, login and administrator controls must remain intact');
const context = { window: {} };
vm.runInNewContext(read('places.js'), context);
assert.ok(context.window.PLACES.length > 0);
const config = JSON.parse(read('vercel.json'));
for (const route of ['/list', '/list/']) assert.ok(config.rewrites.some(r => r.source === route && r.destination === '/list.html'));
assert.match(listing, /rel="canonical" href="https:\/\/www\.mzsdz\.com\/list"/);
console.log(`PASS: ${context.window.PLACES.length} source places; identical list logic and controls; assets resolve at both list routes.`);
