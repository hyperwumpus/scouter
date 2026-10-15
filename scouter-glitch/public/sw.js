const CACHE='scouter-shell-v1-6';
const SHELL=['./','./app.mjs','./ui.mjs','./projects.mjs','./creator.mjs','./analytics.mjs','./style.css','./glitch.png','./favicon.svg','./manifest.webmanifest','./icons/icon-192-v2.png','./icons/icon-512-v2.png','./icons/apple-touch-icon-v2.png','./icons/favicon-v2-32.png','./icons/glitch-mark-v2.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('scouter-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.includes('/api/'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||new Response('Scouter needs an internet connection for this page.',{status:503}))));});

