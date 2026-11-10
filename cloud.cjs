'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digestFile=async file=>{const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');};
function createCloud({dataDir,catalog,onProgress=()=>{}}){
 const configFile=path.join(dataDir,'google-drive-folder.json'),cacheDir=path.join(dataDir,'offline-media');let folder=null,job=null,mountCheckedAt=0,mountAvailable=false;
 function entry(id){const c=catalog[id];if(!c||!/^[a-z0-9-]+$/.test(id)||!/^[a-f0-9]{64}$/.test(c.sha256)||!new RegExp('^'+id+'\\.(mp4|mp3|m4a|webm)$').test(c.fileName)||!Number.isSafeInteger(c.bytes)||c.bytes<=0)throw Error('素材记录不完整。');return c;}
 function fileFor(id){const c=entry(id);return path.join(cacheDir,id+'-'+c.sha256.slice(0,16)+path.extname(c.fileName));}
 function cached(id){const file=fileFor(id);try{return fs.statSync(file).size===entry(id).bytes?file:null;}catch{return null;}}
 function mounted(){if(Date.now()-mountCheckedAt>1000){mountCheckedAt=Date.now();mountAvailable=!!folder&&fs.existsSync(folder);}return mountAvailable;}
 function source(id){const c=entry(id),file=cached(id);if(file)return{kind:'offline',path:file,available:true};return folder?{kind:'cloud',path:path.join(folder,c.fileName),available:mounted()}:null;}
 function status(){const ids=Object.keys(catalog).filter(cached);return{configured:!!folder,provider:'Google Drive',mountAvailable:mounted(),offlineCount:ids.length,offlineBytes:ids.reduce((n,id)=>n+entry(id).bytes,0),offlineIds:ids,download:job?{id:job.id,loaded:job.loaded,total:job.total,percent:job.percent}:null};}
 async function verify(id,root=folder){if(!root)throw Error('先连接谷歌网盘素材文件夹。');const stat=await fs.promises.stat(path.join(root,entry(id).fileName));if(!stat.isFile()||stat.size!==entry(id).bytes)throw Error('网盘目录尚未同步完整，请稍后重试。');}
 async function connect(value){
  if(value?.provider!=='google-drive-desktop'||value.version!==1||!path.isAbsolute(value.rootFolder))throw Error('请选择谷歌网盘中的素材文件夹。');
  const root=await fs.promises.realpath(value.rootFolder),manifestFile=path.join(root,'listeningXuan-library.json'),stat=await fs.promises.stat(manifestFile);if(stat.size>131072)throw Error('素材库清单过大。');const manifest=JSON.parse(await fs.promises.readFile(manifestFile,'utf8'));
  if(manifest.version!==1||manifest.libraryId!=='listeningXuan-2026-midterms-v1'||manifest.files?.length!==Object.keys(catalog).length)throw Error('文件夹中没有完整的 listeningXuan 素材清单。');
  const seen=new Set();for(const item of manifest.files){const c=entry(item.id);if(seen.has(item.id)||['bytes','sha256','fileName'].some(k=>item[k]!==c[k]))throw Error('网盘素材库版本与软件不一致。');seen.add(item.id);}
  // Only file metadata is checked here: connecting must not hydrate every video.
  const ids=Object.keys(catalog);for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(id=>verify(id,root)));
  fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(configFile+'.tmp',JSON.stringify({version:1,provider:'google-drive-desktop',rootFolder:root}));fs.renameSync(configFile+'.tmp',configFile);folder=root;mountCheckedAt=0;return status();
 }
 async function download(id){
  const c=entry(id);if(cached(id))return status();if(job)throw Error('已有一份素材正在保存。');if(!folder||!mounted())throw Error('请先启动并登录谷歌网盘桌面版。');fs.mkdirSync(cacheDir,{recursive:true});const dest=fileFor(id),partial=dest+'.part',controller=new AbortController();job={id,loaded:0,total:c.bytes,percent:0,controller};let handle;onProgress(status());
  try{
   await verify(id);handle=await fs.promises.open(partial,'w',0o600);const hash=crypto.createHash('sha256');let notifyAt=0;
   for await(const chunk of fs.createReadStream(path.join(folder,c.fileName),{signal:controller.signal})){if(controller.signal.aborted)throw Error('保存已取消。');job.loaded+=chunk.length;if(job.loaded>c.bytes)throw Error('素材文件大小不一致。');hash.update(chunk);let offset=0;while(offset<chunk.length){const r=await handle.write(chunk,offset,chunk.length-offset);if(!r.bytesWritten)throw Error('磁盘写入失败。');offset+=r.bytesWritten;}job.percent=Math.floor(job.loaded/c.bytes*100);if(Date.now()-notifyAt>200){onProgress(status());notifyAt=Date.now();}}
   await handle.close();handle=null;if(job.loaded!==c.bytes||hash.digest('hex')!==c.sha256||await digestFile(partial)!==c.sha256)throw Error('文件校验未通过，请重新保存。');fs.renameSync(partial,dest);
  }catch(e){if(handle)await handle.close().catch(()=>{});try{fs.unlinkSync(partial);}catch{}throw Error(controller.signal.aborted?'保存已取消，未保留不完整文件。':e.message||'保存未成功。');}
  finally{job=null;onProgress(status());}return status();
 }
 function cancel(){job?.controller.abort();return true;}
 function clear(){if(job)throw Error('先取消正在保存的素材。');for(const id of Object.keys(catalog))try{fs.unlinkSync(fileFor(id));}catch(e){if(e.code!=='ENOENT')throw Error('离线文件正在使用，请停止播放后重试。');}return status();}
 function disconnect(){if(job)throw Error('先取消正在保存的素材。');try{fs.unlinkSync(configFile);}catch(e){if(e.code!=='ENOENT')throw e;}folder=null;mountCheckedAt=0;return status();}
 try{const saved=JSON.parse(fs.readFileSync(configFile,'utf8'));if(saved.provider==='google-drive-desktop'&&saved.version===1&&path.isAbsolute(saved.rootFolder))folder=saved.rootFolder;}catch{}
 return{status,source,cached,connect,download,cancel,clear,disconnect,verify};
}
module.exports={createCloud,digestFile};
