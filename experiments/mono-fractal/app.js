// SPDX-License-Identifier: Apache-2.0
'use strict';

const $ = id => document.getElementById(id);
const MICRO = 8, GRID = 32, SYMBOLS = 256, REPEATS = 4, MARGIN_MM = 12, SAMPLE = 12;
let patterns = [], layout = [], templates = null, trainingOrder = null, lastResult = null;

function rng32(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] !== b[i];
  return d;
}
function balancedPattern(rnd) {
  for (;;) {
    const ids = shuffle(Array.from({ length: 64 }, (_, i) => i), rnd).slice(0, 32);
    const p = new Uint8Array(64);
    for (const i of ids) p[i] = 1;
    let ok = true;
    for (let y = 0; y < 8; y++) {
      let row = 0, col = 0;
      for (let x = 0; x < 8; x++) { row += p[y * 8 + x]; col += p[x * 8 + y]; }
      if (row < 2 || row > 6 || col < 2 || col > 6) { ok = false; break; }
    }
    if (!ok) continue;
    let edges = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = p[y * 8 + x];
      if (x < 7) edges += v !== p[y * 8 + x + 1];
      if (y < 7) edges += v !== p[(y + 1) * 8 + x];
    }
    if (edges >= 36 && edges <= 82) return p;
  }
}
function buildPatterns(seed) {
  const rnd = rng32(seed ^ 0x4d4f4e4f);
  const out = [balancedPattern(rnd)];
  while (out.length < SYMBOLS) {
    let best = null, bestD = -1, bestAvg = -1;
    for (let t = 0; t < 40; t++) {
      const p = balancedPattern(rnd);
      let min = 64, sum = 0;
      for (const q of out) { const d = hamming(p, q); min = Math.min(min, d); sum += d; }
      const avg = sum / out.length;
      if (min > bestD || (min === bestD && avg > bestAvg)) { best = p; bestD = min; bestAvg = avg; }
    }
    out.push(best);
  }
  return out;
}
function buildLayout(seed) {
  const rnd = rng32(seed ^ 0x1951a7);
  const a = [];
  for (let r = 0; r < REPEATS; r++) for (let i = 0; i < SYMBOLS; i++) a.push(i);
  return shuffle(a, rnd);
}
function rebuildExperiment() {
  const seed = Number($('seed').value) || 1951;
  $('sheet-status').textContent = 'Building deterministic 256-glyph codebook…';
  setTimeout(() => {
    patterns = buildPatterns(seed);
    layout = buildLayout(seed);
    templates = null; trainingOrder = null; lastResult = null; $('results').hidden = true;
    const pitch = Number($('pitch').value), side = GRID * pitch + 2 * MARGIN_MM;
    $('sheet-status').textContent = `Ready · 256 glyphs · 32×32 cells · 4 observations/glyph · measurement square ${side.toFixed(1)} mm · microcell ${(pitch / 8).toFixed(3)} mm`;
  }, 0);
}
$('seed').addEventListener('change', rebuildExperiment);
$('pitch').addEventListener('change', rebuildExperiment);
rebuildExperiment();

function patternPath(p) {
  let d = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (p[y * 8 + x]) d += `M${x} ${y}h1v1h-1z`;
  return d;
}
function targetSVG() {
  const pitch = Number($('pitch').value), seed = Number($('seed').value) || 1951;
  if (!patterns.length) { patterns = buildPatterns(seed); layout = buildLayout(seed); }
  const pageW = 210, pageH = 297, board = GRID * pitch + 2 * MARGIN_MM;
  const bx = (pageW - board) / 2, by = 42, dataX = bx + MARGIN_MM, dataY = by + MARGIN_MM;
  const fid = 8, moat = 3;
  const defs = patterns.map((p, i) => `<symbol id="g${i}" viewBox="0 0 8 8"><path d="${patternPath(p)}"/></symbol>`).join('');
  let cells = '';
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const id = layout[y * GRID + x];
    cells += `<use href="#g${id}" x="${dataX + x * pitch}" y="${dataY + y * pitch}" width="${pitch}" height="${pitch}"/>`;
  }
  const corners = [[bx,by],[bx+board,by],[bx+board,by+board],[bx,by+board]];
  const fids = corners.map(([x,y]) => `<rect x="${x-fid/2-moat}" y="${y-fid/2-moat}" width="${fid+2*moat}" height="${fid+2*moat}" fill="white"/><rect x="${x-fid/2}" y="${y-fid/2}" width="${fid}" height="${fid}" fill="black"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/><defs>${defs}</defs><g fill="black">${cells}${fids}</g><g font-family="monospace" fill="black"><text x="15" y="15" font-size="5">PRISM MONO-FRACTAL CAPACITY LAB</text><text x="15" y="23" font-size="3.2">seed ${seed} · pitch ${pitch.toFixed(1)} mm · 8×8 microtexture · 256 states × 4 repeats</text><text x="15" y="29" font-size="3.2">PRINT 100% SCALE · NO FIT TO PAGE · PRINT TWO INDEPENDENT COPIES A + B</text><text x="15" y="${Math.min(285,by+board+14)}" font-size="3">Fiducial centers define the measurement square. Keep all four visible in every photograph.</text></g></svg>`;
}
function blobURL() { return URL.createObjectURL(new Blob([targetSVG()], { type: 'image/svg+xml' })); }
$('download').onclick = () => {
  const u = blobURL(), a = document.createElement('a'); a.href = u; a.download = `prism-mono-fractal-${$('pitch').value}mm.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000);
};
$('open').onclick = () => { const u = blobURL(); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 120000); };

const state = { a: makeState('a'), b: makeState('b') };
function makeState(id) { return { id, image: null, corners: [], scaleX: 1, scaleY: 1, manual: false }; }
function drawPreview(s) {
  const c = $(`preview-${s.id}`), ctx = c.getContext('2d');
  if (!s.image) { c.width = c.height = 0; return; }
  const max = 1100, scale = Math.min(1, max / s.image.naturalWidth, max / s.image.naturalHeight);
  c.width = Math.max(1, Math.round(s.image.naturalWidth * scale)); c.height = Math.max(1, Math.round(s.image.naturalHeight * scale));
  s.scaleX = s.image.naturalWidth / c.width; s.scaleY = s.image.naturalHeight / c.height;
  ctx.drawImage(s.image, 0, 0, c.width, c.height);
  ctx.lineWidth = 3; ctx.strokeStyle = '#ff2d55'; ctx.fillStyle = 'rgba(255,45,85,.16)'; ctx.font = '18px sans-serif';
  s.corners.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff2d55'; ctx.fillText(String(i + 1), p.x + 13, p.y - 10); ctx.fillStyle = 'rgba(255,45,85,.16)'; });
  if (s.corners.length === 4) { ctx.beginPath(); ctx.moveTo(s.corners[0].x,s.corners[0].y); for (let i=1;i<4;i++) ctx.lineTo(s.corners[i].x,s.corners[i].y); ctx.closePath(); ctx.stroke(); }
}
async function loadPhoto(s, file) {
  const url = URL.createObjectURL(file), img = new Image();
  try { await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }); }
  catch { URL.revokeObjectURL(url); throw Error('Could not open image.'); }
  s.image = img; s.corners = []; s.manual = false; drawPreview(s); autoCorners(s);
  $(`auto-${s.id}`).disabled = false; $(`reset-${s.id}`).disabled = false; $(`analyze-${s.id}`).disabled = s.corners.length !== 4;
  $(`status-${s.id}`).textContent = `${img.naturalWidth}×${img.naturalHeight} image loaded · ${s.corners.length === 4 ? '4 fiducials estimated; inspect overlay.' : 'set the four fiducial centers manually.'}`;
}
for (const id of ['a','b']) {
  $(`file-${id}`).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await loadPhoto(state[id], f); } catch (err) { $(`status-${id}`).textContent = err.message; } };
  $(`auto-${id}`).onclick = () => autoCorners(state[id]);
  $(`reset-${id}`).onclick = () => { state[id].corners = []; state[id].manual = true; drawPreview(state[id]); $(`analyze-${id}`).disabled = true; $(`status-${id}`).textContent = 'Click: top-left → top-right → bottom-right → bottom-left fiducial centers.'; };
  $(`preview-${id}`).onclick = e => {
    const s = state[id]; if (!s.image || (!s.manual && s.corners.length === 4)) return;
    if (s.corners.length >= 4) s.corners = [];
    const r = e.currentTarget.getBoundingClientRect(); s.corners.push({ x: (e.clientX-r.left)*e.currentTarget.width/r.width, y:(e.clientY-r.top)*e.currentTarget.height/r.height }); s.manual = true; drawPreview(s);
    $(`analyze-${id}`).disabled = s.corners.length !== 4;
    if (s.corners.length === 4) $(`status-${id}`).textContent = 'Manual corners set. Inspect quadrilateral, then analyze.';
  };
}

function integralGray(data, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4; row += .299*data[i]+.587*data[i+1]+.114*data[i+2];
      I[(y+1)*(w+1)+x+1] = I[y*(w+1)+x+1] + row;
    }
  }
  return I;
}
function rectSum(I,w,x,y,s) { const W=w+1,x2=x+s,y2=y+s; return I[y2*W+x2]-I[y*W+x2]-I[y2*W+x]+I[y*W+x]; }
function autoCorners(s) {
  const c = $(`preview-${s.id}`), ctx = c.getContext('2d'); if (!s.image || !c.width) return;
  ctx.drawImage(s.image,0,0,c.width,c.height); const im=ctx.getImageData(0,0,c.width,c.height), I=integralGray(im.data,c.width,c.height);
  const win=Math.max(7,Math.round(Math.min(c.width,c.height)*.018)), step=Math.max(2,Math.floor(win/4));
  const regions=[[0,0,.55,.55],[.45,0,1,.55],[.45,.45,1,1],[0,.45,.55,1]], out=[];
  for (const [x0f,y0f,x1f,y1f] of regions) {
    let best=Infinity,bx=0,by=0; const x0=Math.floor(c.width*x0f), y0=Math.floor(c.height*y0f), x1=Math.floor(c.width*x1f)-win, y1=Math.floor(c.height*y1f)-win;
    for (let y=y0;y<=y1;y+=step) for (let x=x0;x<=x1;x+=step) { const v=rectSum(I,c.width,x,y,win); if(v<best){best=v;bx=x;by=y;} }
    out.push({x:bx+win/2,y:by+win/2});
  }
  s.corners=out; s.manual=false; drawPreview(s); $(`analyze-${s.id}`).disabled=false; $(`status-${s.id}`).textContent='Auto-detected four darkest fiducial candidates. If a marker is wrong, use “Set corners manually”.';
}

function quadMap(p) {
  const [p0,p1,p2,p3]=p, dx1=p1.x-p2.x, dx2=p3.x-p2.x, dx3=p0.x-p1.x+p2.x-p3.x, dy1=p1.y-p2.y, dy2=p3.y-p2.y, dy3=p0.y-p1.y+p2.y-p3.y;
  const den=dx1*dy2-dx2*dy1; let g=0,h=0;
  if (Math.abs(den)>1e-9) { g=(dx3*dy2-dx2*dy3)/den; h=(dx1*dy3-dx3*dy1)/den; }
  const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,c=p0.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y,f=p0.y;
  return (u,v)=>{const q=g*u+h*v+1;return{x:(a*u+b*v+c)/q,y:(d*u+e*v+f)/q};};
}
function bilinear(data,w,h,x,y) {
  x=Math.max(0,Math.min(w-1.001,x)); y=Math.max(0,Math.min(h-1.001,y)); const x0=Math.floor(x),y0=Math.floor(y),x1=x0+1,y1=y0+1,fx=x-x0,fy=y-y0;
  const gray=(xx,yy)=>{const i=(Math.min(h-1,yy)*w+Math.min(w-1,xx))*4;return (.299*data[i]+.587*data[i+1]+.114*data[i+2])/255;};
  const a=gray(x0,y0)*(1-fx)+gray(x1,y0)*fx,b=gray(x0,y1)*(1-fx)+gray(x1,y1)*fx; return a*(1-fy)+b*fy;
}
async function extractFeatures(s) {
  if (!s.image || s.corners.length !== 4) throw Error('Need an image and four corners.');
  await new Promise(r=>setTimeout(r,20));
  const max=8192, sc=Math.min(1,max/Math.max(s.image.naturalWidth,s.image.naturalHeight)), w=Math.round(s.image.naturalWidth*sc),h=Math.round(s.image.naturalHeight*sc);
  const cv=document.createElement('canvas'); cv.width=w;cv.height=h;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(s.image,0,0,w,h);const im=cx.getImageData(0,0,w,h);
  const corners=s.corners.map(q=>({x:q.x*s.scaleX*sc,y:q.y*s.scaleY*sc})), map=quadMap(corners), pitch=Number($('pitch').value), board=GRID*pitch+2*MARGIN_MM;
  const feats=new Array(GRID*GRID);
  for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){
    const f=new Float32Array(SAMPLE*SAMPLE);let mean=0;
    for(let sy=0;sy<SAMPLE;sy++)for(let sx=0;sx<SAMPLE;sx++){
      const u=(MARGIN_MM+(gx+(sx+.5)/SAMPLE)*pitch)/board,v=(MARGIN_MM+(gy+(sy+.5)/SAMPLE)*pitch)/board,q=map(u,v),z=bilinear(im.data,w,h,q.x,q.y);f[sy*SAMPLE+sx]=z;mean+=z;
    }
    mean/=f.length;let variance=0;for(let i=0;i<f.length;i++){f[i]-=mean;variance+=f[i]*f[i];}const sd=Math.sqrt(variance/f.length)+1e-5;for(let i=0;i<f.length;i++)f[i]/=sd;feats[gy*GRID+gx]=f;
  }
  cv.width=cv.height=1; return feats;
}
function buildTemplates(feats) {
  const sums=Array.from({length:SYMBOLS},()=>new Float64Array(SAMPLE*SAMPLE)),counts=new Uint16Array(SYMBOLS);
  feats.forEach((f,i)=>{const k=layout[i];counts[k]++;for(let j=0;j<f.length;j++)sums[k][j]+=f[j];});
  return sums.map((s,k)=>{const f=new Float32Array(s.length);for(let j=0;j<s.length;j++)f[j]=s[j]/counts[k];return f;});
}
function sqdist(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return s;}
function farthestOrder(t) {
  const n=t.length,D=Array.from({length:n},()=>new Float32Array(n));let bi=0,bj=1,bd=-1;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const d=sqdist(t[i],t[j]);D[i][j]=D[j][i]=d;if(d>bd){bd=d;bi=i;bj=j;}}
  const out=[bi,bj],used=new Uint8Array(n);used[bi]=used[bj]=1,minD=new Float32Array(n);minD.fill(Infinity);
  for(let i=0;i<n;i++)minD[i]=Math.min(D[i][bi],D[i][bj]);
  while(out.length<n){let best=-1,d=-1;for(let i=0;i<n;i++)if(!used[i]&&minD[i]>d){d=minD[i];best=i;}used[best]=1;out.push(best);for(let i=0;i<n;i++)if(!used[i])minD[i]=Math.min(minD[i],D[i][best]);}
  return out;
}
function classify(feats,t) {
  const distances=new Array(feats.length),pred=new Uint16Array(feats.length),margins=new Float32Array(feats.length);
  for(let i=0;i<feats.length;i++){
    const row=new Float32Array(SYMBOLS);let b=0,d1=Infinity,d2=Infinity;
    for(let k=0;k<SYMBOLS;k++){const d=sqdist(feats[i],t[k]);row[k]=d;if(d<d1){d2=d1;d1=d;b=k;}else if(d<d2)d2=d;}
    distances[i]=row;pred[i]=b;margins[i]=(d2-d1)/(d2+1e-9);
  }
  return {distances,pred,margins};
}
function metrics(truth,pred,states) {
  const index=new Map(states.map((s,i)=>[s,i])),K=states.length,C=Array.from({length:K},()=>new Uint32Array(K));let n=0,ok=0;
  for(let i=0;i<truth.length;i++){const a=index.get(truth[i]);if(a===undefined)continue;const b=index.get(pred[i]);if(b===undefined)continue;C[a][b]++;n++;if(a===b)ok++;}
  const rs=new Float64Array(K),cs=new Float64Array(K);for(let a=0;a<K;a++)for(let b=0;b<K;b++){rs[a]+=C[a][b];cs[b]+=C[a][b];}
  let mi=0;for(let a=0;a<K;a++)for(let b=0;b<K;b++){const c=C[a][b];if(c)mi+=(c/n)*Math.log2((c*n)/(rs[a]*cs[b]));}
  return {accuracy:n?ok/n:0,mi,confusion:C,n};
}
function subsetPred(classified, subset) {
  const inSet=new Uint8Array(SYMBOLS);for(const k of subset)inSet[k]=1;const p=new Uint16Array(classified.distances.length);
  for(let i=0;i<p.length;i++){let best=subset[0],d=Infinity;for(const k of subset){const q=classified.distances[i][k];if(q<d){d=q;best=k;}}p[i]=best;}return p;
}
function renderConfusion(C) {
  const cv=$('confusion'),ctx=cv.getContext('2d'),im=ctx.createImageData(256,256);let max=1;for(const r of C)for(const v of r)max=Math.max(max,v);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){const v=C[y][x]/max,i=(y*256+x)*4,g=Math.round(255*(1-v));im.data[i]=g;im.data[i+1]=g;im.data[i+2]=g;im.data[i+3]=255;}ctx.putImageData(im,0,0);
}
$('analyze-a').onclick=async()=>{
  try{$('status-a').textContent='Extracting full-resolution cell observations…';$('analyze-a').disabled=true;const f=await extractFeatures(state.a);$('status-a').textContent='Building 256 print-A templates and geometry-only codebook ordering…';templates=buildTemplates(f);trainingOrder=farthestOrder(templates);$('status-a').textContent=`Calibration complete · ${f.length} cells · ${SAMPLE}×${SAMPLE} normalized samples/cell · templates learned only from print A.`;$('analyze-b').disabled=!(state.b.image&&state.b.corners.length===4);}catch(e){$('status-a').textContent=e.message;}finally{$('analyze-a').disabled=false;}
};
$('analyze-b').onclick=async()=>{
  if(!templates)return $('status-b').textContent='Calibrate print A first.';
  try{$('status-b').textContent='Extracting independent print-B observations…';$('analyze-b').disabled=true;const f=await extractFeatures(state.b);$('status-b').textContent='Classifying against print-A templates…';const cl=classify(f,templates),truth=Uint16Array.from(layout),all=Array.from({length:256},(_,i)=>i),full=metrics(truth,cl.pred,all),pitch=Number($('pitch').value),subsetRows=[];
    for(const K of [16,32,64,128,256]){const ss=trainingOrder.slice(0,K),p=subsetPred(cl,ss),m=metrics(truth,p,ss);subsetRows.push({states:K,rawBits:Math.log2(K),accuracy:m.accuracy,mi:m.mi,density:m.mi/(pitch*pitch)});}
    const avgMargin=cl.margins.reduce((a,b)=>a+b,0)/cl.margins.length;lastResult={version:1,seed:Number($('seed').value),pitchMm:pitch,micro:8,grid:32,symbols:256,repeats:4,imageA:[state.a.image.naturalWidth,state.a.image.naturalHeight],imageB:[state.b.image.naturalWidth,state.b.image.naturalHeight],sampleSize:SAMPLE,full:{accuracy:full.accuracy,mutualInformationBitsPerCell:full.mi,bitsPerMm2:full.mi/(pitch*pitch),meanNearestMargin:avgMargin},subsets:subsetRows};
    $('accuracy').textContent=(100*full.accuracy).toFixed(2)+'%';$('mi').textContent=full.mi.toFixed(3)+' bit/cell';$('density').textContent=(full.mi/(pitch*pitch)).toFixed(3)+' bit/mm²';$('margin').textContent=avgMargin.toFixed(3);$('subset-body').innerHTML=subsetRows.map(r=>`<tr><td>${r.states}</td><td>${r.rawBits.toFixed(3)}</td><td>${(100*r.accuracy).toFixed(2)}%</td><td>${r.mi.toFixed(3)}</td><td>${r.density.toFixed(3)}</td></tr>`).join('');renderConfusion(full.confusion);$('results').hidden=false;$('status-b').textContent='Blind print-B evaluation complete. Results use no print-B information for codebook selection.';
  }catch(e){$('status-b').textContent=e.message;}finally{$('analyze-b').disabled=false;}
};
$('export').onclick=()=>{if(!lastResult)return;const u=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`prism-mono-result-${lastResult.pitchMm}mm.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);};
