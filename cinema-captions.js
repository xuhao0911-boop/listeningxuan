(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CinemaCaptions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function units(text,chinese){return chinese?Array.from(text):text.match(/\S+\s*/g)||[];}
 function partition(tokens,count,limit,measure,chinese,targets){
  const n=tokens.length,prefix=[0];for(const t of tokens)prefix.push(prefix.at(-1)+measure(t));
  const dp=Array.from({length:count+1},()=>Array(n+1).fill(Infinity)),prev=Array.from({length:count+1},()=>Array(n+1).fill(-1));dp[0][0]=0;
  for(let k=1;k<=count;k++)for(let end=k;end<=n-(count-k);end++)for(let start=k-1;start<end;start++){
   if(!Number.isFinite(dp[k-1][start]))continue;const width=prefix[end]-prefix[start];if(width>limit)continue;
   const last=tokens[end-1].trimEnd(),next=tokens.slice(end,end+4).join('');let boundary=0;
   if(end<n){boundary=/[,;:.!?，；：。！？、]$/.test(last)?0:chinese?/^(?:我们|你们|他们|因为|为了|以及|让|每|在|也|和|为|对)/.test(next)?2:5:/^(?:and|or|but|because|who|that|which|when|for|to|in|with)\b/i.test(next)?2:5;}
   const target=targets?.[k-1]??k/count,progress=prefix[end]/Math.max(1,prefix[n]);
   const cost=dp[k-1][start]+boundary+Math.pow(width/Math.max(1,prefix[n]/count)-1,2)*3+Math.pow(progress-target,2)*12;
   if(cost<dp[k][end]){dp[k][end]=cost;prev[k][end]=start;}
  }
  if(!Number.isFinite(dp[count][n]))return null;const parts=[];let end=n;
  for(let k=count;k>0;k--){const start=prev[k][end];parts.unshift({text:tokens.slice(start,end).join('').trim(),start,end,fraction:prefix[end]/Math.max(1,prefix[n])});end=start;}
  return parts;
 }
 function layout(cue,width,enMeasure,zhMeasure){
  const en=units(cue.en,false),zh=units(cue.zh||'',true),limit=Math.max(80,width-12),enWidth=en.reduce((s,t)=>s+enMeasure(t),0),zhWidth=zh.reduce((s,t)=>s+zhMeasure(t),0);
  let first=Math.max(1,Math.ceil(enWidth/limit),Math.ceil(zhWidth/limit)),last=Math.max(1,Math.min(en.length,zh.length||en.length));first=Math.min(first,last);
  for(let count=first;count<=last;count++){
   const a=partition(en,count,limit,enMeasure,false);if(!a)continue;
   const b=zh.length?partition(zh,count,limit,zhMeasure,true,a.map(p=>p.fraction)):null;if(zh.length&&!b)continue;
   return a.map((p,i)=>({en:p.text,zh:b?.[i].text||'',wordIndex:p.start,wordEnd:p.end}));
  }
  return[{en:cue.en,zh:cue.zh||'',wordIndex:0,wordEnd:en.length}];
 }
 function active(parts,cue,time){
  let chosen=0,total=Math.max(1,cue.en.split(/\s+/).length);
  for(let i=1;i<parts.length;i++){
   const word=parts[i].wordIndex,at=cue.wordStarts?.[word]??cue.start+(cue.end-cue.start)*word/total;
   if(time>=at)chosen=i;else break;
  }
  return parts[chosen];
 }
 return{layout,active};
});
