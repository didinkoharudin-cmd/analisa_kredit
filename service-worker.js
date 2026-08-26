const CACHE = 'analisis-kredit-pwa-V18.3.11.38-manual-tenor-hotfix';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;
 const u=new URL(r.url);
 if(r.mode==='navigate'){
   e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return res;})
   .catch(()=>caches.match('./index.html').then(x=>x||caches.match('./offline.html'))));return;
 }
 if(u.origin===self.location.origin){
   e.respondWith(caches.match(r).then(x=>x||fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;})));
 }
});
