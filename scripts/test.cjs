// SPDX-License-Identifier: Apache-2.0
'use strict';
const {
  spawnSync
} = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'),
  files = fs.readdirSync(path.join(root, 'test')).filter(n => n.endsWith('.test.cjs')).sort().map(n => path
    .join('test', n));
const run = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
