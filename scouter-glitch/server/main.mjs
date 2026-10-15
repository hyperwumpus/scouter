import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Store} from './store.mjs';
import {Providers} from './providers.mjs';
import {AppError,text,safeUrl} from './domain.mjs';
import {buildReport,reportText} from './report.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=new Map([['/',['index.html','text/html']],['/app.mjs',['app.mjs','text/javascript']],['/ui.mjs',['ui.mjs','text/javascript']],['/style.css',['style.css','text/css']],['/glitch.png',['glitch.png','image/png']],['/favicon.svg',['favicon.svg','image/svg+xml']],['/manifest.webmanifest',['manifest.webmanifest','application/manifest+json']],['/sw.js',['sw.js','text/javascript']],...['icon-192.png','icon-512.png','apple-touch-icon.png'].map(n=>['/icons/'+n,['icons/'+n,'image/png']])]);
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError('Send JSON.',415);let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1e6)throw new AppError('Too much data.',413);chunks.push(chunk);}try{const d=JSON.parse(Buffer.concat(chunks).toString());if(!d||Array.isArray(d)||typeof d!=='object')throw Error();return d;}catch{throw new AppError('Invalid JSON.');}}
export function createApp({store=new Store(join(process.env.SCOUTER_DATA_DIR||join(root,'.data'),'scouter.sqlite')),providers=new Providers(store),report=buildReport}={}){
 const token=randomBytes(32).toString('hex');let active=0;const calls=[];
 const send=(res,status,d)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(d));};
 async function limited(fn){const now=Date.now();while(calls.length&&calls[0]<now-60000)calls.shift();if(active>=3||calls.length>=30)throw new AppError('Please wait a moment before another search or check.',429);calls.push(now);active++;try{return await fn();}finally{active--;}}
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))throw new AppError('Use localhost.',403);
   if((req.headers.origin&&req.headers.origin!==`http://${host}`)||req.headers['sec-fetch-site']==='cross-site')throw new AppError('Cross-site requests are blocked.',403);
   const pathname=new URL(req.url,`http://${host}`).pathname;
   if(req.method==='GET'&&pathname==='/api/bootstrap')return send(res,200,{token,connected:providers.status().google.configured,workspace:store.setting('glitch:v1',{revision:0,leads:[]})});
   if(pathname.startsWith('/api/')){
    const t=String(req.headers['x-scouter-token']||'');if(t.length!==token.length||!timingSafeEqual(Buffer.from(t),Buffer.from(token)))throw new AppError('Reload Scouter to reconnect.',403);
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
