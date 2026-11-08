const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'portfolio');
const output = path.join(root, 'dist');
const files = ['index.html', '404.html', 'portfolio.css', 'portfolio-mark.svg', 'robots.txt', 'sitemap.xml',
  'app-wiki.webp', 'app-world.webp', 'app-people.webp', 'app-style.webp'];

for (const file of files) {
  fs.accessSync(path.join(source, file), fs.constants.R_OK);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const file of files) {
  fs.copyFileSync(path.join(source, file), path.join(output, file));
}
