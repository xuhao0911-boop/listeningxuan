(function(root,factory){if(typeof module==='object')module.exports=factory();else root.Core=factory()})(this,function(){
'use strict';
const stamp=s=>s.trim().replace(',','.').split(':').reduce((a,n)=>a*60+Number(n),0);
const decode=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function parseSubtitles(raw,rolling=false){
 const blocks=raw.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n[ \t]*\n(?=\d+\s*\n\d{2}:|(?:\d+:)?\d{2}:\d{2}[,.]|$)/),out=[];
 for(const block of blocks){const lines=block.trim().split('\n'),i=lines.findIndex(x=>x.includes('-->'));if(i<0)continue;const m=lines[i].match(/((?:\d+:)?\d{2}:\d{2}[,.]\d+)\s*-->\s*((?:\d+:)?\d{2}:\d{2}[,.]\d+)/);if(!m)continue;const start=stamp(m[1]),end=stamp(m[2]);if(!Number.isFinite(start)||end<=start||(rolling&&end-start<.08))continue;
 let content=lines.slice(i+1).filter(Boolean);if(rolling&&content.some(x=>/<\d\d:/.test(x)))content=content.filter(x=>/<\d\d:/.test(x));content=content.map(decode).filter(Boolean);if(!content.length)continue;
 let en=content.filter(x=>!/[\u4e00-\u9fff]/.test(x)).join(' '),zh=content.filter(x=>/[\u4e00-\u9fff]/.test(x)).join(' ');if(!en){en=content.join(' ');zh=''}
 if(rolling&&out.length){const p=out[out.length-1];if(p.en===en){p.end=end;continue}if(en.startsWith(p.en+' '))en=en.slice(p.en.length+1);else{const old=p.en.split(' '),now=en.split(' ');for(let n=Math.min(old.length,now.length);n>=3;n--){if(old.slice(-n).join(' ')===now.slice(0,n).join(' ')){en=now.slice(n).join(' ');break}}}if(!en)continue}
 out.push({start,end,en,zh});
 }
 out.sort((a,b)=>a.start-b.start);
 if(!rolling)return out;
 const merged=[];for(const c of out){let p=merged.at(-1);if(p&&p.end>=c.start-.5&&p.en.split(' ').length<18&&c.end-p.start<=10&&!/[.!?]["']?$/.test(p.en)){p.en+=' '+c.en;p.end=c.end}else merged.push({...c})}return merged;
}
function findCue(cues,time){let low=0,high=cues.length-1,result=0;while(low<=high){let mid=(low+high)>>1;if(cues[mid].start<=time+.005){result=mid;low=mid+1}else high=mid-1}return result}
const words=s=>(s.toLowerCase().replace(/[’‘]/g,"'").match(/[a-z0-9]+(?:'[a-z]+)*/g)||[]);
function compare(expected,input){const a=words(expected),b=words(input),dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);let i=a.length,j=b.length,matched=[];while(i&&j){if(a[i-1]===b[j-1]){matched.push(i-1);i--;j--}else if(dp[i-1][j]>=dp[i][j-1])i--;else j--}return{score:a.length+b.length?Math.round(200*matched.length/(a.length+b.length)):0,words:a,matched}}
return{parseSubtitles,findCue,compare};});
