// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs=require('node:fs'),path=require('node:path'),A=require('./alphabet.js');
const channels=[[0,0,0],[.05,.2,.08],[.09,.45,.15]],features=A.candidates.map(g=>channels.map(p=>A.feature(g,...p)));
const distance=features.map((a,i)=>features.map((b,j)=>i===j?Infinity:Math.min(...channels.map((_,p)=>a[p].reduce((s,v,k)=>s+(v-b[p][k])**2,0)/a[p].length))));
const profiles={};
for(const base of [32,64,128]){
 let best=null,bestScore=[-1,-1];
 for(let first=0;first<A.candidates.length;first++){
  const ids=[first],chosen=new Set(ids),near=distance[first].slice();
  while(ids.length<base){let next=-1,value=-1;for(let i=0;i<near.length;i++)if(!chosen.has(i)&&near[i]>value){next=i;value=near[i];}
   ids.push(next);chosen.add(next);for(let i=0;i<near.length;i++)near[i]=Math.min(near[i],distance[next][i]);
  }
  const closest=ids.map(i=>Math.min(...ids.filter(j=>i!==j).map(j=>distance[i][j]))),score=[Math.min(...closest),closest.reduce((a,b)=>a+b,0)/base];
  if(score[0]>bestScore[0]+1e-8||Math.abs(score[0]-bestScore[0])<1e-8&&score[1]>bestScore[1]){best=ids;bestScore=score;}
 }
 best.sort((a,b)=>a-b);const pairs=[];for(let i=0;i<best.length;i++)for(let j=0;j<i;j++)pairs.push({a:i,b:j,distance:distance[best[i]][best[j]]});pairs.sort((a,b)=>a.distance-b.distance);
 profiles[base]={base,bits:Math.log2(base),selected:best,minSquaredDistance:bestScore[0],nearestPairs:pairs.slice(0,5)};
}
const data={id:'PX-1',algorithm:'Deterministic multi-start max-min packing from 128 color/shape candidates',channels,profiles};
const output='// SPDX-License-Identifier: Apache-2.0\n// Frozen experiment identifiers. Change PX version if these symbols change.\n(function(r,v){if(typeof module===\'object\'&&module.exports)module.exports=v;else r.PrismXProfiles=v;})(globalThis,'+JSON.stringify(data,null,2)+');\n';
fs.writeFileSync(path.join(__dirname,'profiles.js'),output);
console.log(Object.values(profiles).map(p=>({base:p.base,bits:p.bits,minSquaredDistance:p.minSquaredDistance})));
