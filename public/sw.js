// Service worker do Ágile Talentos: recebe currículos compartilhados (ex.: pelo WhatsApp).
const SHARE_CACHE='agile-share-v1';

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='POST'||url.pathname!=='/share-target')return;
  event.respondWith((async()=>{
    try{
      const form=await event.request.formData();
      const file=form.getAll('resume').find(f=>f&&typeof f==='object'&&f.size>0);
      const cache=await caches.open(SHARE_CACHE);
      await cache.delete('/shared-resume');
      if(file){
        await cache.put('/shared-resume',new Response(file,{headers:{
          'content-type':file.type||'application/octet-stream',
          'x-file-name':encodeURIComponent(file.name||'curriculo')
        }}));
        return Response.redirect('/?share=1',303);
      }
    }catch(error){console.error('Falha ao receber arquivo compartilhado',error)}
    return Response.redirect('/?share=erro',303);
  })());
});
