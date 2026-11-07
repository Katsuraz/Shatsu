const CACHE='shatsu-v0.3.0';
const ASSETS=['/','/styles.css','/app.js','/guide.js','/discover.js','/spotify.js','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}return r}).catch(()=>caches.match(event.request)));});
