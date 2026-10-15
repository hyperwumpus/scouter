import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Projects,emailDraft,aiBrief,demoPage} from './projects.mjs';
import {proposalPdf} from './proposal.mjs';
import {creatorReport,creatorText} from './creator.mjs';
import {Store} from './store.mjs';
import {Providers} from './providers.mjs';
import {AppError,text,safeUrl} from './domain.mjs';
import {buildReport,reportText} from './report.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=new Map([['/',['index.html','text/html']],['/app.mjs',['app.mjs','text/javascript']],['/ui.mjs',['ui.mjs','text/javascript']],['/projects.mjs',['projects.mjs','text/javascript']],['/creator.mjs',['creator.mjs','text/javascript']],['/style.css',['style.css','text/css']],['/glitch.png',['glitch.png','image/png']],['/favicon.svg',['favicon.svg','image/svg+xml']],['/manifest.webmanifest',['manifest.webmanifest','application/manifest+json']],['/sw.js',['sw.js','text/javascript']],...['icon-192.png','icon-512.png','apple-touch-icon.png','icon-192-v2.png','icon-512-v2.png','apple-touch-icon-v2.png','favicon-v2-32.png','glitch-mark-v2.png'].map(n=>['/icons/'+n,['icons/'+n,'image/png']])]);
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError('Send JSON.',415);let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1e6)throw new AppError('Too much data.',413);chunks.push(chunk);}try{const d=JSON.parse(Buffer.concat(chunks).toString());if(!d||Array.isArray(d)||typeof d!=='object')throw Error();return d;}catch{throw new AppError('Invalid JSON.');}}
export function createApp({store=new Store(join(process.env.SCOUTER_DATA_DIR||join(root,'.data'),'scouter.sqlite')),providers=new Providers(store),report=buildReport,attachmentDir=join(process.env.SCOUTER_DATA_DIR||join(root,'.data'),'attachments')}={}){
 const projects=new Projects(store,attachmentDir);
 const token=randomBytes(32).toString('hex');let active=0;const calls=[];
 const send=(res,status,d)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(d));};
 async function limited(fn){const now=Date.now();while(calls.length&&calls[0]<now-60000)calls.shift();if(active>=3||calls.length>=30)throw new AppError('Please wait a moment before another search or check.',429);calls.push(now);active++;try{return await fn();}finally{active--;}}
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))throw new AppError('Use localhost.',403);
   if((req.headers.origin&&req.headers.origin!==`http://${host}`)||req.headers['sec-fetch-site']==='cross-site')throw new AppError('Cross-site requests are blocked.',403);
   const pathname=new URL(req.url,`http://${host}`).pathname;
   if(req.method==='GET'&&pathname==='/api/bootstrap'){res.setHeader('Set-Cookie',`ScouterLocal=${token}; HttpOnly; SameSite=Strict; Path=/api/`);return send(res,200,{token,connected:providers.status().google.configured,providers:providers.status(),workspace:store.setting('glitch:v1',{revision:0,leads:[]})});}
   if(pathname.startsWith('/api/')){
    const attachmentRead=req.method==='GET'&&/^\/api\/project-files\/[a-f0-9-]+$/.test(pathname);
    const cookie=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('ScouterLocal='))?.slice('ScouterLocal='.length);
    const t=String(req.headers['x-scouter-token']||(attachmentRead?cookie:'')||'');if(Buffer.byteLength(t)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(t),Buffer.from(token)))throw new AppError('Reload Scouter to reconnect.',403);
    if(req.method==='GET'&&pathname==='/api/projects')return send(res,200,{projects:projects.list()});
    if(req.method==='POST'&&pathname==='/api/projects')return send(res,201,projects.save(await body(req)));
    if(req.method==='POST'&&pathname==='/api/creator/report'){const input=await body(req);const r=await limited(()=>creatorReport(input,providers));return send(res,200,{...r,text:creatorText(r)});}
    if(req.method==='PUT'&&pathname==='/api/creator/connection'){const d=await body(req),key=text(d.key,500);if(!key)throw new AppError('Enter a YouTube Data API key.');store.set('key:youtube',key);return send(res,200,{configured:true});}
    const projectRoute=pathname.match(/^\/api\/projects\/([a-f0-9-]+)(?:\/(files|activity|proposal|brief|demo|email))?$/);
    if(projectRoute){const[,id,action]=projectRoute;const p=projects.get(id);
      if(req.method==='GET'&&!action)return send(res,200,p);
      if(req.method==='PUT'&&!action)return send(res,200,projects.save(await body(req),id));
      if(req.method==='POST'&&action==='activity')return send(res,200,projects.activity(id,(await body(req)).note));
      if(req.method==='POST'&&action==='files'){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>25*1024*1024)throw new AppError('Choose a file up to 25 MB.',413);chunks.push(c);}let name;try{name=decodeURIComponent(req.headers['x-file-name']||'Reference');}catch{throw new AppError('Invalid file name.');}return send(res,201,await projects.attach(id,name,Buffer.concat(chunks)));}
      if(req.method==='GET'&&action==='brief')return send(res,200,{text:aiBrief(p)});
      if(req.method==='GET'&&action==='email')return send(res,200,emailDraft(p));
      if(req.method==='GET'&&action==='demo')return send(res,200,{html:demoPage(p)});
      if(req.method==='GET'&&action==='proposal'){res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Scouter-Proposal-Draft.pdf"','Cache-Control':'no-store'});return res.end(Buffer.from(await proposalPdf(p)));}
    }
    if(attachmentRead){const f=await projects.file(pathname.split('/').pop()),size=(await stat(f.path)).size;res.setHeader('Content-Type',f.meta.type);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(f.meta.name)}`);res.setHeader('Cache-Control','no-store');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");const range=req.headers.range;if(range){const m=range.match(/^bytes=(\d+)-(\d*)$/);if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});return createReadStream(f.path,{start,end}).pipe(res);}res.writeHead(200,{'Content-Length':size});return createReadStream(f.path).pipe(res);}
    if(req.method==='POST'&&pathname==='/api/search'){const input=await body(req);return send(res,200,await limited(()=>providers.googleSearch({...input,serviceId:'website'})));}
    if(req.method==='POST'&&pathname==='/api/details'){const d=await body(req);return send(res,200,await limited(()=>providers.googleDetails(text(d.placeId,200))));}
    if(req.method==='POST'&&pathname==='/api/report'){const d=await body(req);return send(res,200,await limited(async()=>{const r=await report(await providers.googleDetails(text(d.placeId,200)),undefined,{compareUrl:text(d.compareUrl,2000)});return {...r,text:reportText(r)};}));}
    if(req.method==='PUT'&&pathname==='/api/connection'){const d=await body(req),key=text(d.key,500);if(!key)throw new AppError('Enter a Google Places key.');store.set('key:google',key);return send(res,200,{configured:true});}
    if(req.method==='PUT'&&pathname==='/api/saved'){
      const d=await body(req),current=store.setting('glitch:v1',{revision:0,leads:[]});if(d.revision!==current.revision)throw new AppError('Another tab changed your shortlist. Reload before saving.',409);
      if(!Array.isArray(d.leads)||d.leads.length>200)throw new AppError('Invalid shortlist.');
      const ids=new Set();const leads=d.leads.map(l=>{const placeId=text(l.placeId,200);if(!/^[a-zA-Z0-9_-]+$/.test(placeId)||ids.has(placeId))throw new AppError('Invalid or duplicate Google place.');ids.add(placeId);return {placeId,note:text(l.note,3000),conceptUrl:safeUrl(l.conceptUrl),contactTested:l.contactTested===true,status:['Researching','Contacted','Not now'].includes(l.status)?l.status:'Researching'};});
      const next={revision:current.revision+1,leads};store.set('glitch:v1',next);return send(res,200,next);
    }
    throw new AppError('Route not found.',404);
   }
   if(req.method!=='GET'||!files.has(pathname))throw new AppError('Page not found.',404);
   const[name,type]=files.get(pathname);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await readFile(join(root,'public',name)));
  }catch(e){if(res.headersSent)return res.end();send(res,e instanceof AppError?e.status:500,{error:e instanceof AppError?e.message:'The check could not complete. Your saved work is safe.'});}
 });return {server,store};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {server,store}=createApp();server.listen(Number(process.env.PORT||4319),'127.0.0.1',()=>console.log('Scouter Glitch is running at http://127.0.0.1:'+Number(process.env.PORT||4319)));const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);}
