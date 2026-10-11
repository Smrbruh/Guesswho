import {localToken,supabase} from './supabase';

export const pushSupported=()=>!supabase&&window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
export const needsHomeScreen=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
let registration:Promise<ServiceWorkerRegistration>|null=null;
export function pushRegistration(){
  registration??=navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).catch(error=>{registration=null;throw error;});
  return registration;
}
export async function pushRequest<T>(action:string,body:unknown={}):Promise<T>{
  const response=await fetch(`/api/local/push/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'PUSH_FAILED');return result;
}
export async function syncPush(lang:string){
  if(!pushSupported()||Notification.permission!=='granted')return;
  const subscription=await (await pushRegistration()).pushManager.getSubscription();
  if(subscription){await pushRequest('subscribe',{subscription:subscription.toJSON(),lang});window.dispatchEvent(new Event('push-change'));}
}
export async function enablePush(lang:string){
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error(permission==='denied'?'PUSH_DENIED':'PUSH_DISMISSED');
  const [worker,config]=await Promise.all([pushRegistration(),pushRequest<{publicKey:string}>('config')]);
  const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
  let subscription=await worker.pushManager.getSubscription();
  if(subscription){
    const existing=subscription.options.applicationServerKey;
    if(existing&&Array.from(new Uint8Array(existing)).join(',')!==Array.from(key).join(',')){await pushRequest('unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();subscription=null;}
  }
  subscription??=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await pushRequest('subscribe',{subscription:subscription.toJSON(),lang});
  return subscription;
}
export async function disablePush(){
  const worker=await pushRegistration(),subscription=await worker.pushManager.getSubscription();
  if(subscription){await pushRequest('unsubscribe',{endpoint:subscription.endpoint});if(!await subscription.unsubscribe())throw new Error('PUSH_UNSUBSCRIBE_FAILED');}
  const notifications=await worker.getNotifications();notifications.forEach(notification=>notification.close());
}
