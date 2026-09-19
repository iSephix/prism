// SPDX-License-Identifier: Apache-2.0
'use strict';
const $=id=>document.getElementById(id),X=PrismX;
let code=null,bytes=null,stream=null,cameraToken=0,timer=null,worker=null,sequence=0,benchWorker=null,lastBenchmark=null;
const pending=new Map(),log=PrismScanLog.create(X.version,{userAgent:navigator.userAgent,stableVersion:Prism19.version,experimental:true});
const base=()=>Number($('base').value),mm=()=>Number($('print-mm').value);
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function json(name,value){download(name,new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));}
function badge(g){return `<svg viewBox="0 0 1 1" aria-hidden="true"><rect width="1" height="1" fill="white"/>${PrismXAlphabet.svgSymbol(g,0,0)}</svg>`;}
function capacityTable(){const width=mm();if(!Number.isFinite(width)||width<20||width>200)return;
 const ecc=$('ecc').value,rows=[19,32,64,128].map(b=>{const payload=b===19?Prism19Core.capacity({L:15,M:13,Q:11,H:9}[ecc],61):X.capacity(b,61,ecc),rate=b===19?{L:15,M:13,Q:11,H:9}[ecc]/19:X.internals.K[ecc]/31;
 return `<tr><td>${b===19?'19 · stable':b+' · PX'}</td><td>${b===19?'Reference':'+'+((Math.log2(b)/Math.log2(19)-1)*100).toFixed(1)+'%'}</td><td>${payload.toLocaleString()} bytes</td><td>${(payload/width**2).toFixed(3)}</td><td>${(rate*100).toFixed(1)}%</td></tr>`;});$('capacity-rows').innerHTML=rows.join('');}
function alphabet(){const symbols=X.alphabet(base()),profile=X.profiles[base()];$('alphabet').innerHTML=symbols.map((g,i)=>`<div>${badge(g)}<span>${i} · ${g.name}</span></div>`).join('');
 $('closest-pairs').innerHTML=profile.nearestPairs.slice(0,3).map(p=>`<div title="${symbols[p.a].name} / ${symbols[p.b].name}">${badge(symbols[p.a])}<span>↔</span>${badge(symbols[p.b])}</div>`).join('');
 $('alphabet-info').textContent=`${base()} symbols selected from 128 color/shape candidates using a fixed synthetic separation search. The pairs below are its closest matches. This is a heuristic, not a proof of the best possible alphabet.`;
}
function render(){bytes=null;$('save-bytes').hidden=true;try{
 const grid=Number($('grid').value),options={base:base(),ecc:$('ecc').value};if(grid)options.grid=grid;
 code=X.encode($('message').value,options);$('code').innerHTML=X.toSVG(code,mm());$('code').style.setProperty('--print-size',`${mm()}mm`);
 $('code-meta').textContent=`${code.bodyBytes.toLocaleString()} bytes · ${code.n} × ${code.n} cells · ${(mm()/code.width).toFixed(3)} mm/cell · ${(code.bodyBytes/mm()**2).toFixed(3)} payload bytes/mm²`;
 $('encode-status').textContent='';for(const id of ['svg','print','read-generated'])$(id).disabled=!!benchWorker;
 }catch(error){code=null;$('code').replaceChildren();$('code-meta').textContent='';$('encode-status').textContent=error.message;for(const id of ['svg','print','read-generated'])$(id).disabled=true;}
 $('reader-hint').textContent=`Reading PX base ${base()}. Match this selector to the code you printed.`;capacityTable();
}
function cancelDecode(reason='Scan cancelled.'){worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timeout);item.reject(new Error(reason));}pending.clear();}
function request(image,budget,source){if(!worker){worker=new Worker('worker.js');worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;clearTimeout(item.timeout);pending.delete(data.id);if(data.error)item.reject(new Error(data.error));else item.resolve(data.result);};worker.onerror=event=>{log.event('worker-error',{message:event.message});cancelDecode('Experimental worker failed. Try again.');};}
 const id=++sequence,selected=base();log.capture(id,image,{source,base:selected,budgetMs:budget},$('include-frames').checked);
 return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>cancelDecode('Decode timed out. Try a clearer frame.'),Math.max(10000,budget+4000));pending.set(id,{resolve:r=>{log.result(id,r);resolve(r);},reject,timeout});worker.postMessage({id,image,base:selected,maxTimeMs:budget},[image.data.buffer]);});
}
function display(result){if(result.verified){bytes=Uint8Array.from(result.bytes);$('result').textContent=result.text??`${bytes.length} binary bytes recovered.`;$('result').hidden=false;$('save-bytes').hidden=false;$('scan-status').textContent=`Verified base ${result.base} · ${bytes.length} bytes · ${Math.round(result.ms)} ms`;return true;}
 $('scan-status').textContent=result.kind==='partial'?'Header found. Hold steady or try Freeze & read.':'No verified code yet. Keep the full code in view.';return false;
}
function stop(){cameraToken++;clearTimeout(timer);cancelDecode();stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').pause();$('video').srcObject=null;$('video').hidden=true;$('camera-idle').hidden=!$('photo').hidden;for(const id of ['stop','freeze'])$(id).hidden=true;$('start').hidden=false;}
function capture(maxSide=1800){const v=$('video'),scale=Math.min(1,maxSide/Math.max(v.videoWidth,v.videoHeight)),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height);}
async function still(image,source){stop();$('result').hidden=true;const photo=$('photo');photo.width=image.width;photo.height=image.height;photo.getContext('2d').putImageData(image,0,0);photo.hidden=false;$('camera-idle').hidden=true;
 const token=cameraToken;$('scan-status').textContent='Reading still image…';try{const r=await request(image,10000,source);if(token===cameraToken)display(r);}catch(error){if(token===cameraToken){log.event('scan-error',{message:error.message});$('scan-status').textContent=error.message;}}}
$('start').onclick=async()=>{stop();const token=cameraToken;try{
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Open this page over HTTPS in a browser with camera access.');
 const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});if(token!==cameraToken){next.getTracks().forEach(t=>t.stop());return;}stream=next;
 const v=$('video');v.srcObject=stream;v.hidden=false;$('photo').hidden=true;$('camera-idle').hidden=true;await v.play();if(token!==cameraToken)return;
 const track=stream.getVideoTracks()[0];try{if(track.getCapabilities?.().focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}catch{/* Optional. */}
 if(token!==cameraToken)return;const settings=track.getSettings();log.event('camera-start',{base:base(),width:settings.width,height:settings.height,frameRate:settings.frameRate,facingMode:settings.facingMode,scheduler:'timer-pixels'});
 $('start').hidden=true;for(const id of ['stop','freeze'])$(id).hidden=false;$('scan-status').textContent='Looking for an experimental code…';$('result').hidden=true;
 const probe=document.createElement('canvas');probe.width=48;probe.height=48;const pc=probe.getContext('2d',{willReadFrequently:true});let busy=false,lastTime=-1,lastHash=null,frames=0,pulses=0,failures=0;
 const schedule=()=>{if(token===cameraToken&&stream)timer=setTimeout(()=>{schedule();return tick();},120);};
 const tick=async()=>{if(token!==cameraToken||!stream)return;if(++pulses%20===0)log.event('camera-heartbeat',{frames,busy,mediaTime:v.currentTime,readyState:v.readyState});if(busy||v.readyState<2||!v.videoWidth)return;busy=true;
  try{pc.drawImage(v,0,0,48,48);const pixels=pc.getImageData(0,0,48,48).data;let hash=2166136261;for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)hash=Math.imul(hash^pixels[i+c],16777619);
   if(v.currentTime===lastTime&&hash===lastHash)return;lastTime=v.currentTime;lastHash=hash;const image=capture(++frames%2?1120:1800);$('scan-status').textContent=`Reading frame ${frames}…`;
   const result=await request(image,6000,'camera');if(token!==cameraToken)return;failures=0;log.event('camera-complete',{frame:frames,kind:result.kind});if(display(result))stop();
  }catch(error){if(token===cameraToken){log.event('capture-error',{message:error.message});$('scan-status').textContent=error.message;if(++failures>=3)stop();}}finally{busy=false;}
 };schedule();
 }catch(error){if(token===cameraToken){log.event('camera-error',{message:error.message});stop();$('scan-status').textContent=error.message;}}
};
$('stop').onclick=()=>{stop();$('scan-status').textContent='Camera stopped.';};
$('freeze').onclick=()=>{if(stream&&$('video').readyState>=2)still(capture(),'freeze');};
$('choose-image').onclick=()=>$('image-file').click();
$('image-file').onchange=async()=>{const file=$('image-file').files[0];if(!file)return;stop();const token=cameraToken,url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();if(token!==cameraToken)return;const ratio=Math.min(1,1800/Math.max(image.width,image.height)),c=document.createElement('canvas');c.width=Math.round(image.width*ratio);c.height=Math.round(image.height*ratio);const ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);await still(ctx.getImageData(0,0,c.width,c.height),'upload');}catch(error){$('scan-status').textContent=error.message;}finally{URL.revokeObjectURL(url);$('image-file').value='';}};
$('read-generated').onclick=()=>{if(code){const image=X.toRGBA(code,12);still(new ImageData(image.data,image.width,image.height),'generated');}};
$('save-bytes').onclick=()=>{if(bytes)download('prism-experimental-payload.bin',new Blob([bytes],{type:'application/octet-stream'}));};
$('svg').onclick=()=>{if(code)download(`prism-px-base${code.base}.svg`,new Blob([X.toSVG(code,mm())],{type:'image/svg+xml'}));};
$('print').onclick=()=>{if(code)window.print();};
$('fill').onclick=()=>{const n=Number($('payload-size').value),text='Higher bases must recover more useful bytes from the same printed area. ';$('message').value=text.repeat(Math.ceil(n/text.length)).slice(0,n);render();};
$('message').oninput=render;$('grid').onchange=render;$('ecc').onchange=render;$('print-mm').oninput=render;
$('base').onchange=()=>{stop();$('result').hidden=true;log.event('profile-change',{base:base()});alphabet();render();};
$('include-frames').onchange=()=>{if(!$('include-frames').checked)log.clearFrames();};
$('save-report').onclick=()=>{const report=log.report(frame=>{const c=document.createElement('canvas');c.width=frame.width;c.height=frame.height;c.getContext('2d').putImageData(new ImageData(frame.data,frame.width,frame.height),0,0);return c.toDataURL('image/png');},$('include-frames').checked,$('report-note').value);report.experiment={format:X.version,base:base()};json(`prism-experimental-scan-${Date.now()}.json`,report);};
function benchRows(rows){$('benchmark-rows').innerHTML=PrismXBenchmark.summarize(rows).map(r=>`<tr><td>${r.base===19?'19 · stable':r.base+' · PX'}</td><td>${r.successes}/${r.trials}</td><td>${r.largestPassingTestBytes?r.largestPassingTestBytes.toLocaleString()+' bytes':'None yet'}</td><td>${r.largestPassingTestBytesPerMm2.toFixed(3)}</td></tr>`).join('');}
function benchmarkDone(){benchWorker?.terminate();benchWorker=null;$('benchmark').disabled=false;$('cancel-benchmark').hidden=true;for(const id of ['start','choose-image'])$(id).disabled=false;render();}
$('benchmark').onclick=()=>{stop();lastBenchmark=null;$('save-benchmark').disabled=true;$('benchmark').disabled=true;$('cancel-benchmark').hidden=false;for(const id of ['start','choose-image','read-generated'])$(id).disabled=true;
 let cfg;try{cfg=PrismXBenchmark.config({pixels:Number($('pixels').value),mm:mm(),channel:$('channel').value,ecc:$('ecc').value,maxTimeMs:3000});}catch(error){$('benchmark-status').textContent=error.message;benchmarkDone();return;}
 const rows=[];benchRows(rows);benchWorker=new Worker('worker.js');$('benchmark-status').textContent='Starting equal-area comparison…';
 benchWorker.onmessage=({data})=>{if(data.error){$('benchmark-status').textContent=data.error;benchmarkDone();return;}if(data.progress){rows.push(data.row);benchRows(rows);$('benchmark-status').textContent=`${data.completed}/${data.total} trials · ${cfg.mm} mm · ${cfg.pixels} pixels · ${cfg.channel}`;}
  if(data.benchmark){lastBenchmark=data.benchmark;$('save-benchmark').disabled=false;const wrong=lastBenchmark.rows.some(r=>r.wrong);$('benchmark-status').textContent=wrong?'Unexpected decoded bytes: do not trust these results.':`Complete · ${cfg.mm} mm, ${cfg.pixels} pixels, ${cfg.channel}. All reported successes match every original byte.`;benchmarkDone();}};
 benchWorker.onerror=event=>{$('benchmark-status').textContent=event.message||'Comparison worker failed.';benchmarkDone();};benchWorker.postMessage({id:1,action:'benchmark',config:cfg});
};
$('cancel-benchmark').onclick=()=>{$('benchmark-status').textContent='Comparison cancelled. Partial rows are not a completed comparison.';benchmarkDone();};
$('save-benchmark').onclick=()=>{if(lastBenchmark)json(`prism-density-comparison-${Date.now()}.json`,lastBenchmark);};
window.addEventListener('pagehide',()=>{stop();benchWorker?.terminate();});
alphabet();render();
