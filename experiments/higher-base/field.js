// SPDX-License-Identifier: Apache-2.0
// Experimental short RS evaluation codes over GF(2^m). Independent of GF19.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PrismXField=factory();})(globalThis,function(){
'use strict';
const fields=new Map(), polys={5:0x25,6:0x43,7:0x89};
function create(bits){
 if(!polys[bits])throw new RangeError('Experimental fields use 5, 6 or 7 bits.');
 if(fields.has(bits))return fields.get(bits);
 const q=1<<bits,N=31,poly=polys[bits],times=new Uint8Array(q*q),inv=new Uint8Array(q);
 for(let a=0;a<q;a++)for(let b=0;b<q;b++){let x=a,y=b,v=0;while(y){if(y&1)v^=x;y>>>=1;x<<=1;if(x&q)x^=poly;}times[a*q+b]=v;}
 const mul=(a,b)=>times[a*q+b];
 for(let a=1;a<q;a++){for(let b=1;b<q;b++)if(mul(a,b)===1){inv[a]=b;break;}if(!inv[a])throw Error('Invalid field polynomial');}
 const powers=Array.from({length:N},(_,x)=>{const p=new Uint8Array(N+1);p[0]=1;for(let i=1;i<=N;i++)p[i]=mul(p[i-1],x);return p;});
 const generators=new Map();
 const validK=k=>{if(!Number.isInteger(k)||k<1||k>=N)throw new RangeError('Invalid RS message length.');};
 function generator(k){validK(k);if(generators.has(k))return generators.get(k);const g=Array.from({length:N},()=>new Uint8Array(k));
  for(let x=0;x<N;x++)for(let j=0;j<k;j++){let v=1;for(let m=0;m<k;m++)if(m!==j)v=mul(v,mul(x^m,inv[j^m]));g[x][j]=v;}generators.set(k,g);return g;}
 function encode(data,k=data.length){const g=generator(k);if(data.length>k||Array.from(data).some(v=>!Number.isInteger(v)||v<0||v>=q))throw new RangeError('Invalid field symbol.');
  return Uint8Array.from(g,row=>{let v=0;for(let i=0;i<k;i++)v^=mul(row[i],data[i]||0);return v;});}
 function solve(rows,rhs,n){if(rows.length<n)return null;const a=rows.map((r,i)=>Uint8Array.from([...r,rhs[i]]));let rank=0;const pivots=[];
  for(let c=0;c<n;c++){let p=rank;while(p<a.length&&!a[p][c])p++;if(p===a.length)continue;[a[p],a[rank]]=[a[rank],a[p]];const v=inv[a[rank][c]];for(let j=c;j<=n;j++)a[rank][j]=mul(a[rank][j],v);
   for(let i=0;i<a.length;i++)if(i!==rank&&a[i][c]){const f=a[i][c];for(let j=c;j<=n;j++)a[i][j]^=mul(f,a[rank][j]);}pivots.push(c);rank++;}
  for(let i=rank;i<a.length;i++)if(a[i][n])return null;if(rank!==n)return null;const out=new Uint8Array(n);for(let i=0;i<n;i++)out[pivots[i]]=a[i][n];return out;}
 function decode(received,k,erasures=[]){validK(k);if(received.length!==N||Array.from(received).some(v=>!Number.isInteger(v)||v<0||v>=q))return null;
  const erased=new Set(erasures),positions=Array.from({length:N},(_,i)=>i).filter(i=>!erased.has(i));if(positions.length<k)return null;
  const direct=encode(received.slice(0,k),k);if(!erasures.some(i=>i<k)&&positions.every(i=>direct[i]===received[i]))return{data:direct.slice(0,k),code:direct,errors:0,erasures:erasures.length};
  for(let t=Math.floor((positions.length-k)/2);t>=0;t--){const rows=[],rhs=[];
   for(const x of positions){const px=powers[x],y=received[x],row=new Uint8Array(k+2*t);row.set(px.subarray(0,k+t));for(let j=0;j<t;j++)row[k+t+j]=mul(y,px[j]);rows.push(row);rhs.push(mul(y,px[t]));}
   const answer=solve(rows,rhs,k+2*t);if(!answer)continue;const num=answer.slice(0,k+t),den=Uint8Array.from([...answer.slice(k+t),1]),coeff=new Uint8Array(k);
   for(let d=num.length-1;d>=t;d--){const f=num[d];coeff[d-t]=f;for(let j=0;j<=t;j++)num[d-t+j]^=mul(f,den[j]);}if(num.some(x=>x))continue;
   const code=Uint8Array.from({length:N},(_,x)=>{let v=0;for(let i=k-1;i>=0;i--)v=mul(v,x)^coeff[i];return v;});let errors=0;for(const x of positions)if(code[x]!==received[x])errors++;
   if(errors<=t)return{data:code.slice(0,k),code,errors,erasures:erasures.length};
  }return null;
 }
 function candidates(costs,k,soft=true,deadline=Infinity){const read=Uint8Array.from(costs,c=>{let b=0;for(let s=1;s<q;s++)if(c[s]<c[b])b=s;return b;}),out=[],seen=new Set();
  function add(r){if(!r)return;const key=Array.from(r.data).join(',');if(seen.has(key))return;seen.add(key);r.score=costs.reduce((s,c,i)=>s+c[r.code[i]],0);out.push(r);}
  const hard=decode(read,k);add(hard);if(!soft||hard&&hard.errors===0)return out;
  const order=costs.map((c,i)=>{let second=Infinity;for(let j=0;j<q;j++)if(j!==read[i])second=Math.min(second,c[j]);return{i,margin:second-c[read[i]]};}).sort((a,b)=>a.margin-b.margin);
  for(let e=1;e<=N-k&&performance.now()<deadline;e++)add(decode(read,k,order.slice(0,e).map(x=>x.i)));
  return out.sort((a,b)=>a.score-b.score).slice(0,3);
 }
 const f={bits,q,N,mul,inv,encode,decode,candidates};fields.set(bits,f);return f;
}
return{create};
});
