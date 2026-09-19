// SPDX-License-Identifier: Apache-2.0
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const X=require('../experiments/higher-base/codec.js'),dir=path.join(__dirname,'../experiments/higher-base');
function context(){const c=vm.createContext({TextEncoder,TextDecoder,URL,performance,crypto:globalThis.crypto,Uint8Array,Uint8ClampedArray,Float32Array,Int16Array,Int8Array,Uint32Array,DataView,ArrayBuffer});c.self=c;return c;}
test('the experimental page loads its dependencies in browser order',()=>{
 const c=context(),html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 for(const match of html.matchAll(/<script defer src="([^"]+)"/g))if(match[1]!=='app.js')vm.runInContext(fs.readFileSync(path.join(dir,match[1]),'utf8'),c,{filename:match[1]});
 assert.equal(c.Prism19.version,'0.3.4');assert.equal(c.PrismX.version,'PX-1');assert.equal(c.PrismXBenchmark.config().pixels,420);
 assert.equal(c.PrismXBenchmark.trial(32,128,2071,{channel:'clean',pixels:640}).exact,true);
});
test('the actual PX worker recovers every base through its message contract',()=>{
 const c=context(),out=[];c.postMessage=value=>out.push(value);
 c.importScripts=(...files)=>{for(const file of files)vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),c,{filename:file});};
 vm.runInContext(fs.readFileSync(path.join(dir,'worker.js'),'utf8'),c);
 for(const base of [32,64,128]){
  const message=`Base ${base} worker transport 🛰️`,code=X.encode(message,{base});
  c.onmessage({data:{id:base,image:X.toRGBA(code),base,maxTimeMs:3000}});
  const response=out.at(-1);assert.equal(response.id,base);assert.equal(response.error,undefined);assert.equal(response.result.verified,true);assert.equal(response.result.text,message);
 }
 c.onmessage({data:{id:99,image:{width:1,height:1},base:32}});assert.equal(out.at(-1).id,99);assert.match(out.at(-1).error,/RGBA/);
});
