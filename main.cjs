const {app,BrowserWindow,Menu,ipcMain,dialog,shell,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto');
const {parseSubtitles}=require('./core.js');
const {migrate}=require('./migrate.cjs');
const {createCloud}=require('./cloud.cjs');
app.setName('listeningXuan');
app.commandLine.appendSwitch('disk-cache-size','67108864');
const testProfile=process.argv.find(a=>a.startsWith('--test-profile='));
if(testProfile)app.setPath('userData',path.resolve(testProfile.slice(15)));
if(!app.requestSingleInstanceLock())app.quit();
let win,library=[],imports=[],cloud;const dataDir=()=>app.getPath('userData'),dataFile=()=>path.join(dataDir(),'progress.json');
const read=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const atomic=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',JSON.stringify(v));fs.renameSync(f+'.tmp',f)};
const validSender=e=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Invalid sender')};
function material(l,imported=false){const full=imported?l.mediaPath:path.join(__dirname,l.src),remote=imported?null:cloud?.source(l.id),hasLocal=fs.existsSync(full),src=remote?.kind==='offline'?pathToFileURL(remote.path).href:hasLocal?pathToFileURL(full).href:remote?.available&&remote.path?pathToFileURL(remote.path).href:remote?.url||'';return{...l,src,poster:l.poster?pathToFileURL(path.join(__dirname,l.poster)).href:'',available:!!src,storage:imported?'local':remote?.kind==='offline'?'offline':hasLocal?'local':remote?.kind||'unconfigured',imported}}
function createWindow(){
 Menu.setApplicationMenu(null);
 win=new BrowserWindow({title:'listeningXuan',width:1480,height:960,minWidth:1080,minHeight:720,show:false,backgroundColor:'#f5f6f3',icon:path.join(__dirname,'icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.once('ready-to-show',()=>testProfile?win.showInactive():win.show());win.loadFile(path.join(__dirname,'index.html'));
}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
app.whenReady().then(()=>{
 const localPage=pathToFileURL(path.join(__dirname,'index.html')).href;
 const canFullscreen=(w,p)=>p==='fullscreen'&&w===win?.webContents&&w.getURL()===localPage;
 session.defaultSession.setPermissionRequestHandler((w,p,cb)=>cb(canFullscreen(w,p)));
 session.defaultSession.setPermissionCheckHandler((w,p)=>canFullscreen(w,p));
 library=read(path.join(__dirname,'lessons.json'),[]);imports=read(path.join(dataDir(),'imports.json'),[]);
 cloud=createCloud({dataDir:dataDir(),catalog:read(path.join(__dirname,'cloud-catalog.json'),{}),onProgress:status=>{if(win&&!win.isDestroyed())win.webContents.send('cloud-progress',status)}});
 ipcMain.handle('boot',e=>{validSender(e);const state=migrate(read(dataFile(),{}),library);atomic(dataFile(),state);return{lessons:[...library.map(l=>material(l)),...imports.map(l=>material(l,true))],state,cloud:cloud.status()}});
 ipcMain.handle('cloud-status',e=>{validSender(e);return cloud.status()});
 ipcMain.handle('cloud-connect',async e=>{validSender(e);const chosen=await dialog.showOpenDialog(win,{title:'选择谷歌网盘中的 listeningXuan 素材文件夹',properties:['openDirectory']});if(chosen.canceled)return null;try{return await cloud.connect({version:1,provider:'google-drive-desktop',rootFolder:chosen.filePaths[0]})}catch(err){throw Error(err.message||'请确认已登录谷歌网盘桌面版，并等待素材目录同步完成。')}});
 ipcMain.handle('cloud-source',(e,id)=>{validSender(e);const l=library.find(x=>x.id===id);if(!l)throw Error('素材不存在。');return material(l)});
 ipcMain.handle('cloud-download',(e,id)=>{validSender(e);if(!library.some(x=>x.id===id))throw Error('素材不存在。');return cloud.download(id)});
 ipcMain.handle('cloud-cancel',e=>{validSender(e);return cloud.cancel()});
 ipcMain.handle('cloud-clear',e=>{validSender(e);return cloud.clear()});
 ipcMain.handle('cloud-disconnect',e=>{validSender(e);return cloud.disconnect()});
 ipcMain.handle('save',(e,state)=>{validSender(e);const s=JSON.stringify(state);if(s.length>4000000)throw Error('Progress too large');atomic(dataFile(),state);return true});
 ipcMain.on('save-sync',(e,state)=>{try{validSender(e);if(JSON.stringify(state).length<=4000000)atomic(dataFile(),state);e.returnValue=true}catch{e.returnValue=false}});
 ipcMain.handle('document',async(e,id,kind)=>{validSender(e);const l=library.find(x=>x.id===id),relative=kind==='answers'?l?.answerDocument:l?.questionDocument;if(!relative)throw Error('没有对应文档');const filename=path.resolve(__dirname,relative.replace(/\.pdf$/,'.html'));if(!filename.startsWith(path.resolve(__dirname,'documents')+path.sep)||!fs.existsSync(filename))throw Error('文档不存在');const doc=new BrowserWindow({parent:win,title:'listeningXuan · '+(kind==='answers'?'答案':'题目'),width:1050,height:900,autoHideMenuBar:true,backgroundColor:'#e7ece3',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});doc.webContents.setWindowOpenHandler(()=>({action:'deny'}));doc.webContents.on('will-navigate',ev=>ev.preventDefault());await doc.loadFile(filename);return true});
 ipcMain.handle('import',async(e,category)=>{validSender(e);const media=await dialog.showOpenDialog(win,{title:'选择视频或音频',properties:['openFile'],filters:[{name:'视频 / 音频',extensions:['mp4','webm','mov','m4v','mp3','m4a','wav','ogg']}]});if(media.canceled)return null;
 const sub=await dialog.showOpenDialog(win,{title:category==='ielts'?'选择字幕；没有字幕可点取消，仅导入音频':'选择对应的 SRT 或 VTT 字幕',properties:['openFile'],filters:[{name:'字幕',extensions:['srt','vtt']}]});let cues;if(sub.canceled){if(category!=='ielts')return null;cues=[{start:0,end:1,en:'',zh:''}]}else{const file=sub.filePaths[0];if(fs.statSync(file).size>10000000)throw Error('字幕文件过大');cues=parseSubtitles(fs.readFileSync(file,'utf8'),file.endsWith('.vtt'));if(!cues.length)throw Error('未读到字幕，请使用 UTF-8 编码的 SRT 或 VTT 文件');}
 const lesson={id:'local-'+crypto.randomUUID(),category:category==='ielts'?'ielts':'speeches',speaker:path.basename(media.filePaths[0],path.extname(media.filePaths[0])),role:category==='ielts'?'雅思 · 本地导入':'我的素材',title:'本地导入',date:'',mediaPath:media.filePaths[0],duration:sub.canceled?0:cues.at(-1).end,cues,...(sub.canceled?{hasTranscript:false}:{}),subtitleType:sub.canceled?'未附字幕':'导入字幕'};imports.push(lesson);atomic(path.join(dataDir(),'imports.json'),imports);return material(lesson,true)});
 ipcMain.handle('source',async(e,id)=>{validSender(e);const l=library.find(x=>x.id===id);if(l?.url&&new URL(l.url).protocol==='https:')await shell.openExternal(l.url)});
 ipcMain.handle('backup',async e=>{validSender(e);const result=await dialog.showSaveDialog(win,{title:'备份学习记录',defaultPath:'listeningXuan-学习记录.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return false;atomic(result.filePath,read(dataFile(),{}));return true});
 createWindow();
});
app.on('window-all-closed',()=>app.quit());
