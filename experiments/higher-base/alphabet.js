// SPDX-License-Identifier: Apache-2.0
// Candidate pool for PX research; it never changes the Prism 19 alphabet.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PrismXAlphabet=factory();})(globalThis,function(){
'use strict';
const inks=[['Black',[12,16,24]],['Blue',[20,48,225]],['Red',[224,35,48]],['Green',[15,170,75]],['Cyan',[0,188,218]],['Magenta',[202,20,169]],['Amber',[238,154,10]],['Violet',[106,36,170]]];
const shapes=['solid','horizontal','vertical','slash','backslash','dot','ring','plus','cross','diamond','diamond-ring','frame','triangle-up','triangle-down','triangle-left','triangle-right'];
const candidates=inks.flatMap(([ink,rgb])=>shapes.map(shape=>({name:`${ink} ${shape}`,ink,rgb,shape})));
function mask(shape,u,v){
 if(u<.08||u>.92||v<.08||v>.92)return 0;
 const x=u-.5,y=v-.5,ax=Math.abs(x),ay=Math.abs(y),r=x*x+y*y;
 switch(shape){
  case 'horizontal':return ay<.23?1:0;
  case 'vertical':return ax<.23?1:0;
  case 'slash':return Math.abs(x+y)<.31?1:0;
  case 'backslash':return Math.abs(x-y)<.31?1:0;
  case 'dot':return r<.25**2?1:0;
  case 'ring':return r<.42**2&&r>.23**2?1:0;
  case 'plus':return ax<.13||ay<.13?1:0;
  case 'cross':return Math.abs(x-y)<.16||Math.abs(x+y)<.16?1:0;
  case 'diamond':return ax+ay<.47?1:0;
  case 'diamond-ring':return ax+ay<.56&&ax+ay>.28?1:0;
  case 'frame':return ax>.25||ay>.25?1:0;
  case 'triangle-up':return ax<(v-.08)/2?1:0;
  case 'triangle-down':return ax<(.92-v)/2?1:0;
  case 'triangle-left':return ay<(u-.08)/2?1:0;
  case 'triangle-right':return ay<(.92-u)/2?1:0;
  default:return 1;
 }
}
function pixel(g,u,v){return mask(g.shape,u,v)?g.rgb:[255,255,255];}
function feature(g,blur=0,loss=0,mix=0){const out=[];
 for(let y=0;y<6;y++)for(let x=0;x<6;x++){const rgb=[0,0,0];let weight=0;
  for(let dy=blur?-2:0;dy<=(blur?2:0);dy++)for(let dx=blur?-2:0;dx<=(blur?2:0);dx++){
   const w=Math.exp(-(dx*dx+dy*dy)/2),p=pixel(g,(x+.5)/6+dx*blur,(y+.5)/6+dy*blur);weight+=w;for(let c=0;c<3;c++)rgb[c]+=p[c]*w;
  }
  for(let c=0;c<3;c++)rgb[c]/=weight;const gray=.299*rgb[0]+.587*rgb[1]+.114*rgb[2];
  for(let c=0;c<3;c++)out.push((rgb[c]*(1-loss)+gray*loss)*(1-mix)+rgb[(c+1)%3]*mix);
 }return out;
}
// Quantize vector exports to a 24x24 mask. Raster tests use the same ink mask;
// this grid is finer than the camera feature grid and contains no font rendering.
function svgSymbol(g,x,y){let d='';for(let row=0;row<24;row++){let start=-1;for(let col=0;col<=24;col++){
 const ink=col<24&&mask(g.shape,(col+.5)/24,(row+.5)/24);if(ink&&start<0)start=col;
 if(!ink&&start>=0){d+=`M${x+start/24},${y+row/24}h${(col-start)/24}v${1/24}h${-(col-start)/24}z`;start=-1;}
 }}return `<path fill="rgb(${g.rgb})" d="${d}"/>`;}
return{inks,shapes,candidates,mask,pixel,feature,svgSymbol};
});
