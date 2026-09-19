// SPDX-License-Identifier: Apache-2.0
// Identical messages, printed footprint, camera channel and budgets for every base.
(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f(require('../../index.cjs'),require('./codec.js'),require('./optics.js'));else r.PrismXBenchmark=f(r.Prism19,r.PrismX,r.PrismXOptics);})(globalThis,function(P,X,O){
'use strict';
const channels={clean:{blur:0,noise:0,perspective:0,colorLoss:0},print:{blur:.5,noise:4,perspective:.12,colorLoss:.15},difficult:{blur:.85,noise:7,perspective:.2,colorLoss:.3},grayscale:{blur:.5,noise:4,perspective:.12,colorLoss:1}};
function config(input={}){const c={pixels:420,mm:60,channel:'print',ecc:'Q',maxTimeMs:3000,...input};
 if(!Number.isFinite(c.pixels)||c.pixels<180||c.pixels>1200||!Number.isFinite(c.mm)||c.mm<20||c.mm>200||!channels[c.channel]||!['L','M','Q','H'].includes(c.ecc)||!Number.isFinite(c.maxTimeMs)||c.maxTimeMs<100||c.maxTimeMs>6000)throw new RangeError('Invalid benchmark settings.');return c;}
function message(size,seed){const r=O.random(seed),chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:-';return Array.from({length:size},()=>chars[Math.floor(r()*chars.length)]).join('');}
function trial(base,size,seed,input={}){const c=config(input),expected=message(size,seed),code=base===19?P.encode(expected,{ecc:c.ecc}):X.encode(expected,{base,ecc:c.ecc});
 const image=O.simulate(code,{pixels:c.pixels,seed,...channels[c.channel]}),result=base===19?P.scan(image,{maxTimeMs:c.maxTimeMs}):X.scan(image,{base,maxTimeMs:c.maxTimeMs});
 const exact=result.verified===true&&result.text===expected,wrong=result.verified===true&&!exact;
 return{base,bytes:size,seed,grid:code.n,footprintMm:c.mm,cellMm:c.mm/code.width,pixels:c.pixels,channel:c.channel,ecc:c.ecc,bodyCodeRate:base===19?code.k/19:code.k/31,exact,wrong,kind:result.kind,ms:Math.round(result.ms),payloadBytesPerMm2:size/(c.mm*c.mm),verifiedBytesPerMm2:exact?size/(c.mm*c.mm):0};
}
function summarize(rows){return[19,32,64,128].map(base=>{const cases=rows.filter(r=>r.base===base),sizes=[...new Set(cases.map(r=>r.bytes))].sort((a,b)=>a-b),passed=sizes.filter(n=>{const tested=cases.filter(r=>r.bytes===n);return tested.length>=2&&new Set(tested.map(r=>r.seed)).size>=2&&tested.every(r=>r.exact);});return{base,trials:cases.length,successes:cases.filter(r=>r.exact).length,wrong:cases.filter(r=>r.wrong).length,largestPassingTestBytes:passed.at(-1)||0,largestPassingTestBytesPerMm2:passed.length?passed.at(-1)/(cases[0].footprintMm**2):0};});}
return{channels,config,trial,summarize};
});
