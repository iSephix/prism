// SPDX-License-Identifier: Apache-2.0
// PX-1: experimental optical alphabets and packet format. Never a Prism 19 mode.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./alphabet.js'),require('./profiles.js'),require('./field.js'),require('./geometry.js'),require('../../src/codec.js'),require('../../src/crc32.js'));else root.PrismX=factory(root.PrismXAlphabet,root.PrismXProfiles,root.PrismXField,root.PrismXGeometry,root.Prism19Core,root.PrismCRC);})(globalThis,function(A,profiles,fields,geometry,stable,CRC){
'use strict';
const VERSION='PX-1',S=6,FEATURES=S*S*3,HEADER=62,K={L:24,M:21,Q:18,H:15},cache=new Map(),utf8=new TextEncoder();
function checkedBase(base){if(![32,64,128].includes(base))throw new RangeError('Choose base 32, 64 or 128.');return base;}
function context(base){checkedBase(base);if(cache.has(base))return cache.get(base);
 const profile=profiles.profiles[base],symbols=profile.selected.map((i,id)=>({...A.candidates[i],id})),F=fields.create(profile.bits),layouts=new Map();
 function layout(n){if(layouts.has(n))return layouts.get(n);const original=stable.layout(n),free=[...original.pilots,...original.slots];
  const value={n,fixed:original.fixed,pilots:free.slice(0,base*2),slots:free.slice(base*2)};layouts.set(n,value);return value;}
 const ctx={base,bits:profile.bits,symbols,F,layout};ctx.locate=geometry.create(layout,symbols,A.mask);cache.set(base,ctx);return ctx;
}
function digits(bytes,bits,length=Math.ceil(bytes.length*8/bits)){const out=new Uint8Array(length);let acc=0,have=0,j=0;
 for(const v of bytes){acc=acc*256+v;have+=8;while(have>=bits){have-=bits;out[j++]=(acc>>>have)&((1<<bits)-1);}acc&=(1<<have)-1;}
 if(have)out[j++]=acc<<(bits-have);if(j>length)throw Error('Radix capacity exceeded');return out;
}
function bytes(ds,bits,length){const out=new Uint8Array(length);let acc=0,have=0,j=0;
 for(const s of ds){if(!Number.isInteger(s)||s<0||s>=(1<<bits))return null;acc=(acc<<bits)|s;have+=bits;
  while(have>=8){have-=8;const v=(acc>>>have)&255;if(j<length)out[j]=v;else if(v)return null;j++;}acc&=(1<<have)-1;}
 return j>=length&&acc===0?out:null;
}
function capacity(base,n=61,ecc='Q'){const c=context(base);if(!K[ecc])throw new RangeError('Invalid correction level.');return Math.max(0,Math.floor(Math.floor((c.layout(n).slots.length-HEADER)/31)*K[ecc]*c.bits/8));}
function encode(value,options={}){
 const base=checkedBase(options.base??32),ctx=context(base),ecc=options.ecc??'Q',k=K[ecc];if(!k)throw new RangeError('Invalid correction level.');
 if(typeof value!=='string'&&!(value instanceof Uint8Array))throw new TypeError('Expected text or Uint8Array.');
 if(typeof value==='string'&&value.isWellFormed&&!value.isWellFormed())throw new TypeError('Unpaired Unicode surrogate.');
 const payload=typeof value==='string'?utf8.encode(value):new Uint8Array(value);if(!payload.length||payload.length>capacity(base,145,ecc))throw new RangeError('Payload exceeds PX capacity.');
 let n=options.grid??25;if(!Number.isInteger(n)||n<25||n>145||(n-25)%4)throw new RangeError('Grid must be 25, 29, …, 145.');
 if(options.grid===undefined)while(n<145&&capacity(base,n,ecc)<payload.length)n+=4;
 if(capacity(base,n,ecc)<payload.length)throw new RangeError('Payload does not fit this grid.');
 const l=ctx.layout(n),cells=new Int16Array(n*n).fill(-1),ds=digits(payload,ctx.bits),blocks=Math.ceil(ds.length/k),h=new Uint8Array(16),view=new DataView(h.buffer);
 h.set([80,88,1,ctx.bits,n,k]);view.setUint16(6,payload.length);view.setUint32(8,CRC.crc32(payload));view.setUint32(12,CRC.crc32(h.subarray(0,12)));
 const hd=digits(h,ctx.bits,30),hc=[ctx.F.encode(hd.slice(0,15)),ctx.F.encode(hd.slice(15))];
 l.pilots.forEach((cell,i)=>cells[cell]=i%base);
 for(let j=0;j<31;j++)for(let b=0;b<2;b++)cells[l.slots[j*2+b]]=hc[b][j];
 const codewords=Array.from({length:blocks},(_,b)=>ctx.F.encode(ds.slice(b*k,(b+1)*k),k));
 for(let j=0;j<31;j++)for(let b=0;b<blocks;b++)cells[l.slots[HEADER+j*blocks+b]]=codewords[b][j];
 let seed=CRC.crc32(payload)||1;for(let i=HEADER+31*blocks;i<l.slots.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;cells[l.slots[i]]=(seed>>>0)%base;}
 return{format:VERSION,base,bits:ctx.bits,ecc,k,n,width:n+8,height:n+8,layout:l,cells,bodyBytes:payload.length,blocks,paritySymbols:blocks*(31-k)+32,repairCount:0};
}
function colorAt(code,x,y){x-=4;y-=4;if(x<0||y<0||x>=code.n||y>=code.n)return[255,255,255];const ix=Math.floor(x),iy=Math.floor(y),cell=iy*code.n+ix,fixed=code.layout.fixed[cell];return fixed>=0?(fixed?[0,0,0]:[255,255,255]):A.pixel(context(code.base).symbols[code.cells[cell]],x-ix,y-iy);}
function raster(code,scale=12){if(!Number.isInteger(scale)||scale<2||code.width*scale>2048)throw new RangeError('Raster scale exceeds image limit.');const width=code.width*scale,data=new Uint8ClampedArray(width*width*4);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,rgb=colorAt(code,(x+.5)/scale,(y+.5)/scale);data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;}return{width,height:width,data};}
function svg(code,mm=60){if(!Number.isFinite(mm)||mm<20||mm>200)throw new RangeError('Printed width must be 20–200 mm.');let out=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${code.width} ${code.height}"><rect width="100%" height="100%" fill="white"/>`,fixed='';const symbols=context(code.base).symbols;
 const used=[...new Set(Array.from(code.cells).filter(v=>v>=0))];out+='<defs>'+used.map(s=>`<g id="px${s}">${A.svgSymbol(symbols[s],0,0)}</g>`).join('')+'</defs>';
 for(let y=0;y<code.n;y++)for(let x=0;x<code.n;x++){const cell=y*code.n+x;if(code.layout.fixed[cell]===1)fixed+=`M${x+4},${y+4}h1v1h-1z`;else if(code.cells[cell]>=0)out+=`<use href="#px${code.cells[cell]}" xlink:href="#px${code.cells[cell]}" x="${x+4}" y="${y+4}"/>`;}
 return out+`<path fill="black" d="${fixed}"/></svg>`;
}
  function sample(image, p, out = [0, 0, 0]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const x = p.x - .5,
      y = p.y - .5,
      ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= image.width || iy + 1 >= image.height) return null;
    out[0] = out[1] = out[2] = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy),
          i = 4 * ((iy + dy) * image.width + ix + dx);
        for (let c = 0; c < 3; c++) out[c] += w * image.data[i + c];
      }
    return out;
  }

  function photometry(image, map, n) {
    const points = [
        [3.5, 3.5],
        [n - 3.5, 3.5],
        [3.5, n - 3.5]
      ],
      whites = [
        [1.5, 3.5],
        [n - 1.5, 3.5],
        [1.5, n - 3.5]
      ];
    const dark = points.map(([x, y]) => sample(image, map(x, y))),
      white = whites.map(([x, y]) => sample(image, map(x, y)));
    if ([...dark, ...white].some(v => !v)) return null;
    if (white.some((v, i) => v.reduce((s, c, j) => s + c - dark[i][j], 0) < 160)) return null;
    return (rgb, x, y, out, offset) => {
      const u = (x - 3.5) / (n - 7), w = (y - 3.5) / (n - 7);
      for (let c = 0; c < 3; c++) {
        const v = rgb[c], d = dark[0][c] + u * (dark[1][c] - dark[0][c]) + w * (dark[2][c] - dark[0][c]),
        b = white[0][c] + u * (white[1][c] - white[0][c]) + w * (white[2][c] - white[0][c]);
        out[offset + c] = Math.max(-40, Math.min(295, 255 * (v - d) / Math.max(55, b - d)));
      }
    };
  }

function observe(image,location,ctx,deadline){
 const n=location.dimension,l=ctx.layout(n);if(l.pilots.length!==ctx.base*2||l.slots.length<HEADER+31)return null;
 const norm=photometry(image,location.photometryMap||location.map,n);if(!norm)return null;
 const data=new Float32Array(n*n*FEATURES),rgb=[0,0,0],cells=[...l.pilots,...l.slots];
 for(let c=0;c<cells.length;c++){if((c&127)===0&&performance.now()>=deadline)return null;const cell=cells[c],x=cell%n,y=Math.floor(cell/n);
  for(let sy=0;sy<S;sy++)for(let sx=0;sx<S;sx++){const u=x+(sx+.5)/S,v=y+(sy+.5)/S;if(!sample(image,location.map(u,v),rgb))return null;norm(rgb,u,v,data,cell*FEATURES+(sy*S+sx)*3);}
 }
 const refs=Array.from({length:ctx.base},()=>new Float32Array(FEATURES));let noise=0,separation=Infinity;
 for(let s=0;s<ctx.base;s++)for(let f=0;f<FEATURES;f++){const a=data[l.pilots[s]*FEATURES+f],b=data[l.pilots[s+ctx.base]*FEATURES+f];refs[s][f]=(a+b)/2;noise+=(a-b)**2/4;}
 for(let a=0;a<ctx.base;a++)for(let b=0;b<a;b++){let d=0;for(let f=0;f<FEATURES;f++)d+=(refs[a][f]-refs[b][f])**2;separation=Math.min(separation,d/FEATURES);}
 return{n,l,data,refs,noise:Math.max(100,noise/(ctx.base*FEATURES)),separation};
}
function classify(obs,ctx,deadline){const q=ctx.base,out=new Float32Array(obs.n*obs.n*q);
 for(let i=0;i<obs.l.slots.length;i++){if((i&63)===0&&performance.now()>=deadline)return null;const cell=obs.l.slots[i],offset=cell*FEATURES;let min=Infinity;
  for(let s=0;s<q;s++){let d=0;const ref=obs.refs[s];for(let f=0;f<FEATURES;f++)d+=(obs.data[offset+f]-ref[f])**2;out[cell*q+s]=d/FEATURES;min=Math.min(min,d/FEATURES);}
  const reliability=1/(1+min/(obs.noise*3));for(let s=0;s<q;s++)out[cell*q+s]=Math.min(24,(out[cell*q+s]-min)/(obs.noise*2))*reliability;
 }return out;
}
function costs(scores,cell,q){return scores.subarray(cell*q,(cell+1)*q);}
function parseHeader(ds,n,ctx){const h=bytes(ds,ctx.bits,16);if(!h)return null;const v=new DataView(h.buffer);
 if(h[0]!==80||h[1]!==88||h[2]!==1||h[3]!==ctx.bits||h[4]!==n||!Object.values(K).includes(h[5])||CRC.crc32(h.subarray(0,12))!==v.getUint32(12))return null;
 const length=v.getUint16(6),count=Math.ceil(length*8/ctx.bits),k=h[5],blocks=Math.ceil(count/k);
 if(!length||HEADER+blocks*31>ctx.layout(n).slots.length)return null;return{n,k,length,count,blocks,crc:v.getUint32(8),key:Array.from(h).join('.')};
}
function readHeader(scores,n,ctx,deadline){const l=ctx.layout(n),lists=[0,1].map(b=>ctx.F.candidates(Array.from({length:31},(_,j)=>costs(scores,l.slots[j*2+b],ctx.base)),15,true,deadline));
 for(const a of lists[0])for(const b of lists[1]){const h=parseHeader([...a.data,...b.data],n,ctx);if(h)return h;}return null;
}
function readBody(scores,h,ctx,deadline){const l=ctx.layout(h.n),lists=[];
 for(let b=0;b<h.blocks;b++){if(performance.now()>=deadline)return null;const list=ctx.F.candidates(Array.from({length:31},(_,j)=>costs(scores,l.slots[HEADER+j*h.blocks+b],ctx.base)),h.k,true,deadline);if(!list.length)return null;lists.push(list);}
 // Bounded alternatives; final acceptance always requires the whole-packet CRC.
 let beam=[{parts:[],score:0}];for(const list of lists){const next=[];for(const item of beam)for(const c of list)next.push({parts:[...item.parts,c],score:item.score+c.score});beam=next.sort((a,b)=>a.score-b.score).slice(0,16);}
 for(const candidate of beam){const ds=candidate.parts.flatMap(c=>Array.from(c.data)),body=bytes(ds,ctx.bits,h.length);if(!body||CRC.crc32(body)!==h.crc)continue;
  let text=null;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{/* Binary payload stays bytes. */}
  return{kind:'experimental',format:VERSION,base:ctx.base,grid:h.n,bytes:Array.from(body),byteLength:body.length,text,verified:true,checksum:h.crc.toString(16).padStart(8,'0'),corrected:candidate.parts.reduce((s,c)=>s+c.errors,0),decoder:'PX pilot calibration + soft RS'};
 }return null;
}
function scan(image,options={}){
 if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<20||image.height<20||image.width*image.height>4194304||image.data?.length!==image.width*image.height*4)throw new RangeError('Expected a bounded RGBA image.');
 const budget=options.maxTimeMs??6000;if(!Number.isFinite(budget)||budget<10||budget>10000)throw new RangeError('Scan budget must be 10–10000 ms.');
 const base=checkedBase(options.base??32),ctx=context(base),start=performance.now(),deadline=start+budget;
 const stats={base,candidates:0,headers:0,cellRefinements:0,observeMs:0,classifyMs:0,decodeMs:0},sampled=new Map();let partial=null;
 const done=result=>({...result,ms:performance.now()-start,timedOut:!result.verified&&performance.now()>=deadline,diagnostics:stats});
 function attempt(location){const n=location?.dimension;if(!Number.isInteger(n)||n<25||n>145||(n-25)%4||typeof location.map!=='function')return null;
  stats.candidates++;if(location.cellRefined)stats.cellRefinements++;let source=image,loc=location;
  if(loc.sampleWidth){const key=`${loc.sampleWidth},${loc.sampleHeight}`;if(!sampled.has(key))sampled.set(key,stable.resize(image,loc.sampleWidth,loc.sampleHeight));source=sampled.get(key);const sx=source.width/image.width,sy=source.height/image.height,scale=map=>(x,y)=>{const p=map(x,y);return{x:p.x*sx,y:p.y*sy};};loc={...loc,map:scale(loc.map),photometryMap:loc.photometryMap&&scale(loc.photometryMap)};}
  let t=performance.now();const obs=observe(source,loc,ctx,deadline);stats.observeMs+=performance.now()-t;if(!obs||obs.separation<30)return null;
  t=performance.now();const scores=classify(obs,ctx,deadline);stats.classifyMs+=performance.now()-t;if(!scores)return null;
  t=performance.now();const h=readHeader(scores,n,ctx,deadline);if(!h){stats.decodeMs+=performance.now()-t;return null;}stats.headers++;partial={kind:'partial',format:VERSION,base,grid:n,verified:false};
  const result=readBody(scores,h,ctx,deadline);stats.decodeMs+=performance.now()-t;return result;
 }
 for(const pose of ctx.locate(image.data,image.width,image.height)){if(performance.now()>=deadline)break;const r=attempt(pose);if(r)return done(r);}
 if(performance.now()<deadline)for(const pose of ctx.locate.search(image,deadline)){if(performance.now()>=deadline)break;const r=attempt(pose);if(r)return done(r);if(stats.candidates>=12)break;}
 return done(partial||{kind:'none',format:VERSION,base,verified:false});
}
return{version:VERSION,profiles:profiles.profiles,alphabet:base=>context(base).symbols,capacity,encode,colorAt,toRGBA:raster,toSVG:svg,scan,
 // These low-level functions support conformance tests and research tooling.
 internals:{context,digits,bytes,parseHeader,readHeader,readBody,K}};
});
