
const VERSION='waves-sound-v24';
const SHELL=VERSION+'-shell';
const FULL=VERSION+'-full';
const SHELL_FILES=[
  './','./index.html','./STUDENT_LESSONS.html','./waves.css','./app.js','./slides.js',
  './pwa.css','./pwa.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./offline-assets.json'
];

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL && k!==FULL).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin) return;
  event.respondWith(
    caches.match(req).then(hit=>{
      if(hit) return hit;
      return fetch(req).then(resp=>{
        if(resp && resp.ok){
          const copy=resp.clone();
          caches.open(FULL).then(c=>c.put(req,copy));
        }
        return resp;
      }).catch(async ()=>{
        if(req.mode==='navigate'){
          return (await caches.match('./STUDENT_LESSONS.html')) || (await caches.match('./index.html'));
        }
        throw new Error('Offline and resource not cached');
      });
    })
  );
});
