// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs=require('node:fs'),B=require('./benchmark.js');
const preset=process.argv[2]||'print',output=process.argv[3];
if(!['print','stress'].includes(preset)||!output)throw Error('Usage: node experiments/higher-base/run-benchmark.cjs print|stress output.json');
const rows=[],channels=preset==='print'?['print']:['print','grayscale'];
for(const channel of channels)for(const size of preset==='print'?[128,512,1024,2048]:[512,2048])for(const seed of preset==='print'?[1901,1902]:[1941,1942])for(const base of [19,32,64,128]){
 const row=B.trial(base,size,seed,{pixels:preset==='print'?420:300,mm:60,channel,ecc:'Q',maxTimeMs:3000});rows.push(row);
 console.log(`${channel} ${base} ${size} ${seed}: ${row.exact?'exact':'unverified'} (${row.ms} ms)`);if(row.wrong)throw Error('Decoder accepted incorrect bytes.');
}
const result={schema:preset==='print'?'prism-density-benchmark':'prism-density-stress',version:1,format:'PX-1',stableVersion:'0.3.4',physicalTrial:false,runtime:process.version};
if(preset==='print')Object.assign(result,{config:B.config(),rows,summary:B.summarize(rows)});else Object.assign(result,{config:{pixels:300,mm:60,ecc:'Q',maxTimeMs:3000},cases:rows});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
