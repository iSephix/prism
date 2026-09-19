// SPDX-License-Identifier: Apache-2.0
importScripts('../../dist/prism19.js','alphabet.js','profiles.js','field.js','geometry.js','codec.js','optics.js','benchmark.js');
self.onmessage=({data})=>{
 try{
  if(data.action==='benchmark'){
   const config=PrismXBenchmark.config(data.config),rows=[];
   for(const size of [128,512,1024,2048])for(const seed of [1901,1902])for(const base of [19,32,64,128]){
    const row=PrismXBenchmark.trial(base,size,seed,config);rows.push(row);self.postMessage({id:data.id,progress:true,row,completed:rows.length,total:32});
    if(row.wrong)throw Error('A decoder accepted incorrect bytes. Stop and inspect this report.');
   }
   self.postMessage({id:data.id,benchmark:{schema:'prism-density-benchmark',version:1,format:PrismX.version,stableVersion:Prism19.version,physicalTrial:false,config,rows,summary:PrismXBenchmark.summarize(rows)}});
  }else self.postMessage({id:data.id,result:PrismX.scan(data.image,{base:data.base,maxTimeMs:data.maxTimeMs??6000})});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
