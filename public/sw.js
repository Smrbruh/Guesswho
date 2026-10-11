self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data;try{data=event.data.json();}catch{return;}
  const expired=data.kind==='call'&&data.expiresAt<Date.now();
  event.waitUntil(self.registration.showNotification(data.title||'GuessWho Arena',{
    body:expired?data.expiredBody:data.body,
    icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',
    tag:data.tag||'guesswho',renotify:data.kind==='call',
    data:{url:data.url},requireInteraction:data.kind==='call'&&!expired,
    timestamp:Date.now()
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let target=new URL(event.notification.data?.url||'/messages',self.location.origin);
    if(target.origin!==self.location.origin)target=new URL('/messages',self.location.origin);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){await existing.navigate(target.href);await existing.focus();}
    else await self.clients.openWindow(target.href);
  })());
});
