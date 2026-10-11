import {beforeAll,afterAll,beforeEach,test,expect,vi} from 'vitest';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import webpush from 'web-push';
import {createDatabase} from '../server/database.mjs';
import {createPushService,validateSubscription} from '../server/push.mjs';

let backend:Awaited<ReturnType<typeof createDatabase>>,push:ReturnType<typeof createPushService>;
const send=vi.fn();
const device=()=>{const curve=createECDH('prime256v1');curve.generateKeys();return{endpoint:`https://fcm.googleapis.com/fcm/send/${randomUUID()}`,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};};
beforeAll(async()=>{backend=await createDatabase('memory://');push=createPushService(backend.db,webpush.generateVAPIDKeys(),{send,autoStart:false});},30000);
afterAll(async()=>{await push.close();await backend.close();});
beforeEach(async()=>{send.mockReset();send.mockResolvedValue({statusCode:201});await backend.db.query('delete from game_private.push_subscriptions');});
async function pair(){const a=await backend.session('','Push A'),b=await backend.session('','Push B');await backend.call(a.profile.id,'request_friend',{p_code:b.profile.friend_code});await backend.call(b.profile.id,'respond_friend',{p_user:a.profile.id,p_accept:true});return{a:a.profile.id,b:b.profile.id};}
const ready=()=>backend.db.query("update game_private.push_deliveries set available_at=now()-interval '1 second'");
const message=(a:string,b:string,nonce=randomUUID())=>backend.call(a,'send_direct_message',{p_user:b,p_body:'Private contents stay private',p_nonce:nonce});

test('push endpoints cannot target local servers, credentials, non-HTTPS or lookalike hosts',()=>{
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://a@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://web.push.apple.com.evil.test/a'])expect(()=>validateSubscription({...device(),endpoint})).toThrow('INVALID_PUSH_SUBSCRIPTION');
  for(const endpoint of ['https://web.push.apple.com/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://wns2-db5p.notify.windows.com/w/?token=abc'])expect(validateSubscription({...device(),endpoint}).endpoint).toBe(endpoint);
  expect(()=>validateSubscription({...device(),keys:{auth:'aaaa',p256dh:'bbbb'}})).toThrow();
});
test('subscriptions are private, idempotent, can move between local accounts and cancel queued deliveries on transfer',async()=>{
  const {a,b}=await pair(),subscription=device();await push.subscribe(b,{subscription,lang:'en'});await push.subscribe(b,{subscription,lang:'en'});
  await message(a,b);expect((await backend.db.query('select * from game_private.push_deliveries')).rows).toHaveLength(1);
  expect(await push.status(a,subscription.endpoint)).toEqual({enabled:false});
  await push.unsubscribe(a,subscription.endpoint);expect(await push.status(b,subscription.endpoint)).toEqual({enabled:true});
  await expect(push.subscribe(a,{subscription:{...subscription,keys:device().keys}})).rejects.toThrow('INVALID_PUSH_SUBSCRIPTION');
  await push.subscribe(a,{subscription,lang:'ru'});expect(await push.status(b,subscription.endpoint)).toEqual({enabled:false});
  await ready();await push.flush();expect(send).not.toHaveBeenCalled();
  await expect(backend.db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from game_private.push_subscriptions');})).rejects.toThrow();
});
test('message retries enqueue once per device, use recipient language and do not expose message contents',async()=>{
  const {a,b}=await pair(),first=device(),second=device();await push.subscribe(b,{subscription:first,lang:'en'});await push.subscribe(b,{subscription:second,lang:'ru'});
  const nonce=randomUUID();await message(a,b,nonce);await message(a,b,nonce);await ready();await push.flush();
  expect(send).toHaveBeenCalledTimes(2);
  const payloads=send.mock.calls.map(call=>JSON.parse(call[1]));expect(payloads.map(p=>p.body).sort()).toEqual(['New private message','Новое личное сообщение'].sort());
  for(const payload of payloads){expect(payload.url).toBe(`/messages?user=${a}`);expect(JSON.stringify(payload)).not.toContain('Private contents');}
  await push.flush();expect(send).toHaveBeenCalledTimes(2);
});
test('read messages, expired jobs, removed friends and cancelled calls never generate stale notifications',async()=>{
  const {a,b}=await pair();await push.subscribe(b,{subscription:device()});const m=await message(a,b);await backend.call(b,'mark_direct_read',{p_user:a,p_through:m.id});await ready();await push.flush();expect(send).not.toHaveBeenCalled();
  await message(a,b);await backend.db.query("update game_private.push_deliveries set expires_at=now()-interval '1 second'");await ready();await push.flush();expect(send).not.toHaveBeenCalled();
  const call=await backend.call(a,'start_direct_call',{p_user:b});await backend.call(a,'end_direct_call',{p_call:call.id});await push.flush();expect(send).not.toHaveBeenCalled();
  await message(a,b);await backend.call(a,'remove_friend',{p_user:b});await ready();await push.flush();expect(send).not.toHaveBeenCalled();
});
test('incoming friend calls push immediately with high priority and a TTL no longer than the ringing window',async()=>{
  const {a,b}=await pair();await push.subscribe(b,{subscription:device(),lang:'en'});const call=await backend.call(a,'start_direct_call',{p_user:b});await push.flush();
  expect(send).toHaveBeenCalledTimes(1);const [,payload,options]=send.mock.calls[0];expect(JSON.parse(payload)).toMatchObject({kind:'call',tag:`call-${call.id}`,url:`/messages?user=${a}`});expect(options.urgency).toBe('high');expect(options.TTL).toBeGreaterThan(0);expect(options.TTL).toBeLessThanOrEqual(45);
  await backend.call(a,'end_direct_call',{p_call:call.id});
});
test('expired subscriptions are deleted, transient failures retry only failed devices, unsubscribe stops pending messages',async()=>{
  const {a,b}=await pair(),gone=device(),retry=device();await push.subscribe(b,{subscription:gone});await push.subscribe(b,{subscription:retry});
  send.mockImplementation(async subscription=>{throw {statusCode:subscription.endpoint===gone.endpoint?410:503};});await message(a,b);await ready();await push.flush();
  expect(await push.status(b,gone.endpoint)).toEqual({enabled:false});expect((await backend.db.query('select * from game_private.push_deliveries')).rows).toHaveLength(1);
  send.mockResolvedValue({statusCode:201});await ready();await push.flush();expect(send).toHaveBeenCalledTimes(3);
  await message(a,b);await push.unsubscribe(b,retry.endpoint);await ready();await push.flush();expect(send).toHaveBeenCalledTimes(3);
});
test('service worker displays native notifications and restricts notification links to this app',async()=>{
  const handlers:Record<string,(event:any)=>void>={},showNotification=vi.fn().mockResolvedValue(undefined),openWindow=vi.fn().mockResolvedValue(undefined);
  runInNewContext(await readFile('public/sw.js','utf8'),{URL,Date,self:{location:{origin:'https://arena.test'},addEventListener:(type:string,handler:any)=>handlers[type]=handler,registration:{showNotification},clients:{matchAll:async()=>[],openWindow}}});
  let pending:Promise<any>=Promise.resolve();const waitUntil=(promise:Promise<any>)=>{pending=promise;};
  handlers.push({data:{json:()=>({title:'Friend',body:'Incoming call',kind:'call',tag:'call-one',url:'/messages?user=friend',expiresAt:Date.now()+45000})},waitUntil});await pending;
  expect(showNotification).toHaveBeenCalledWith('Friend',expect.objectContaining({body:'Incoming call',requireInteraction:true,icon:'/icons/icon-192.png'}));
  handlers.notificationclick({notification:{close:vi.fn(),data:{url:'https://evil.test'}},waitUntil});await pending;expect(openWindow).toHaveBeenCalledWith('https://arena.test/messages');
  handlers.notificationclick({notification:{close:vi.fn(),data:{url:'/messages?user=friend'}},waitUntil});await pending;expect(openWindow).toHaveBeenCalledWith('https://arena.test/messages?user=friend');
});
