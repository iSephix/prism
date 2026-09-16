'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });
fs.cpSync(path.join(root, 'examples'), pub, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(pub, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'spec'), path.join(pub, 'spec'), { recursive: true });
fs.cpSync(path.join(root, 'docs'), path.join(pub, 'docs'), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY.md']) {
  fs.copyFileSync(path.join(root, file), path.join(pub, file));
}

const indexPath = path.join(pub, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html
  .replace('../dist/prism19.js', 'dist/prism19.js')
  .replace('../spec/FORMAT.md', 'spec/FORMAT.md')
  .replace('../docs/API.md', 'docs/API.md')
  .replace('../LICENSE', 'LICENSE')
  .replace('../THIRD_PARTY.md', 'THIRD_PARTY.md');
fs.writeFileSync(indexPath, html);
console.log('Vercel public site prepared.');
