// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs=require('node:fs'),X=require('./codec.js'),PNG=require('../../bin/png.cjs');
const file=process.argv[2];if(!file)throw Error('Supply an experimental scan report path.');
if(fs.statSync(file).size>32*1024*1024)throw Error('Report too large.');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
if(report.schema!=='prism-scan-report'||report.experiment?.format!=='PX-1'||!Array.isArray(report.frames)||report.frames.length>3)throw Error('Expected a bounded PX-1 scan report.');
for(const frame of report.frames){if(frame.encoding!=='png'||typeof frame.data!=='string'||!frame.data.startsWith('data:image/png;base64,'))throw Error('Expected a lossless PNG frame.');
 const image=PNG.decode(Buffer.from(frame.data.split(',')[1],'base64')),base=frame.metadata?.base;
 const r=X.scan(image,{base,maxTimeMs:10000});console.log(JSON.stringify({id:frame.id,base,kind:r.kind,verified:r.verified,bytes:r.byteLength,ms:Math.round(r.ms),diagnostics:r.diagnostics}));
}
