// SPDX-License-Identifier: Apache-2.0
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const X=require('../experiments/higher-base/codec.js'),F=require('../experiments/higher-base/field.js'),O=require('../experiments/higher-base/optics.js'),P=require('..');
const root=path.join(__dirname,'..');
test('the validated optical protocol and camera implementation stay byte-identical',()=>{
 const baseline=require('../experiments/higher-base/stable-baseline.json');for(const [file,sha]of Object.entries(baseline.sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),sha,file);
 const html=fs.readFileSync(path.join(root,'examples/index.html'),'utf8');assert.ok(!html.includes('higher-base/codec.js'));assert.match(html,/higher-base\//);
});
test('GF32/64/128 arithmetic and RS recovery at the errors-plus-erasures bound',()=>{
 const rng=O.random(41093);for(const bits of [5,6,7]){const f=F.create(bits);for(let a=1;a<f.q;a++)assert.equal(f.mul(a,f.inv[a]),1);
  for(const k of [15,18,21,24])for(let trial=0;trial<8;trial++){
   const data=Uint8Array.from({length:k},()=>Math.floor(rng()*f.q)),code=f.encode(data),received=code.slice(),order=Array.from({length:31},(_,i)=>i);
   for(let i=30;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
   const erasures=trial%(31-k+1),errors=Math.floor((31-k-erasures)/2);
   for(const i of order.slice(0,errors+erasures))received[i]^=1+Math.floor(rng()*(f.q-1));
   const decoded=f.decode(received,k,order.slice(0,erasures));assert.ok(decoded,`${bits}/${k}/${trial}`);assert.deepEqual(decoded.data,data);
  }
 }
});
test('PX exact capacity boundaries, bit packing and header isolation',()=>{
 for(const base of [32,64,128]){const {bits}=X.internals.context(base);for(const length of [1,2,3,17,129]){const body=Uint8Array.from({length},(_,i)=>i*37%256);assert.deepEqual(X.internals.bytes(X.internals.digits(body,bits),bits,length),body);}
  for(const ecc of ['L','M','Q','H']){const max=X.capacity(base,61,ecc),code=X.encode(new Uint8Array(max).fill(137),{base,ecc,grid:61});assert.equal(code.n,61);assert.throws(()=>X.encode(new Uint8Array(max+1),{base,ecc,grid:61}),/fit/);}
  const code=X.encode('PX header isolation',{base});assert.equal(P.scan(X.toRGBA(code),{maxTimeMs:1000}).verified,undefined);
  assert.throws(()=>X.encode('x',{base:base+1}),RangeError);
 }
});
test('blind higher-base optical recovery includes non-ASCII and binary bytes',()=>{
 for(const base of [32,64,128])for(const body of ['New alphabet 🛰️ 日本語 \ufeff\0',Uint8Array.from({length:64},(_,i)=>i*37%256)]){const code=X.encode(body,{base}),r=X.scan(X.toRGBA(code),{base,maxTimeMs:3000});assert.equal(r.verified,true);assert.deepEqual(Buffer.from(r.bytes),typeof body==='string'?Buffer.from(body):Buffer.from(body));}
});
test('wrong profiles, blank frames and CRC-consistent RS tampering do not yield a verified payload',()=>{
 const code=X.encode('Independent verification of every byte. '.repeat(5),{base:64}),ctx=X.internals.context(64);
 const h=new Uint8Array([1,2,3,4]);assert.equal(X.internals.parseHeader(X.internals.digits(h,6,30),code.n,ctx),null);
 const ds=ctx.F.encode(new Uint8Array(code.k).fill(9));for(let j=0;j<31;j++)code.cells[code.layout.slots[62+j*code.blocks]]=ds[j];
 assert.equal(X.scan(X.toRGBA(code),{base:64,maxTimeMs:1000}).verified,false);
 const blank={width:100,height:100,data:new Uint8ClampedArray(40000).fill(255)};assert.equal(X.scan(blank,{base:32}).verified,false);
 assert.equal(X.scan(X.toRGBA(X.encode('wrong profile',{base:64})),{base:32,maxTimeMs:1000}).verified,false);
});
test('density results require both independent trials before claiming a passing size',()=>{
 const B=require('../experiments/higher-base/benchmark.js'),r={base:32,bytes:512,seed:1901,exact:true,wrong:false,footprintMm:60};
 assert.equal(B.summarize([r]).find(x=>x.base===32).largestPassingTestBytes,0);
 assert.equal(B.summarize([r,{...r,seed:1902}]).find(x=>x.base===32).largestPassingTestBytes,512);
 assert.equal(B.summarize([r,{...r,seed:1902,exact:false}]).find(x=>x.base===32).largestPassingTestBytes,0);
});
