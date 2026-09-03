const CACHE = 'analisis-kredit-pwa-V18.3.11.76.4-web-push-fast-path';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return res;}).catch(()=>caches.match('./index.html').then(x=>x||caches.match('./offline.html'))));return;}if(u.origin===self.location.origin){e.respondWith(caches.match(r).then(x=>x||fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;})));}});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(e){try{data={body:event.data?event.data.text():''}}catch(_){data={}}}
  const title=String(data.title||'Analisis Kredit');
  const options={body:String(data.body||''),icon:data.icon||'./icon-192.png',badge:'./icon-192.png',tag:data.tag||undefined,renotify:true,data:data.data||{},timestamp:Date.now()};
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{};
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      if('focus'in client)await client.focus();
      try{client.postMessage({type:'WEB_PUSH_CLICK',data});}catch(e){}
      return;
    }
    let url='./';
    if(data.kind==='chat')url='./?push=chat&peer='+encodeURIComponent(String(data.peerEmail||''));
    else if(data.kind==='reminder')url='./?push=reminder';
    if(clients.openWindow)return clients.openWindow(url);
  })());
});
