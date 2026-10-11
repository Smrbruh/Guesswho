import webpush from 'web-push';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,ECDH} from 'node:crypto';

export function validateSubscription(value){
  if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)throw new Error('INVALID_PUSH_SUBSCRIPTION');
  let url;try{url=new URL(value.endpoint);}catch{throw new Error('INVALID_PUSH_SUBSCRIPTION');}
  const host=url.hostname;
  const trusted=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!trusted)throw new Error('INVALID_PUSH_SUBSCRIPTION');
  const keys=value.keys;
  if(!keys||!['p256dh','auth'].every(key=>typeof keys[key]==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(keys[key])))throw new Error('INVALID_PUSH_SUBSCRIPTION');
  if(Buffer.from(keys.auth,'base64url').length!==16||Buffer.from(keys.p256dh,'base64url').length!==65)throw new Error('INVALID_PUSH_SUBSCRIPTION');
  try{ECDH.convertKey(Buffer.from(keys.p256dh,'base64url'),'prime256v1');}catch{throw new Error('INVALID_PUSH_SUBSCRIPTION');}
  return {endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}

export async function loadPushKeys(path){
  try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const keys=webpush.generateVAPIDKeys();await mkdir(dirname(path),{recursive:true});
  try{await writeFile(path,JSON.stringify(keys),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;return JSON.parse(await readFile(path,'utf8'));}
  return keys;
}

export function createPushService(db,keys,{send=webpush.sendNotification.bind(webpush),subject='https://github.com/Smrbruh/Guesswho',autoStart=true}={}){
  let running=null,stopped=false;
  const options={vapidDetails:{...keys,subject},timeout:8000};
  async function subscribe(user,input){
    const subscription=validateSubscription(input.subscription),lang=input.lang==='en'?'en':'ru';
    await db.transaction(async tx=>{
      const existing=(await tx.query('select * from game_private.push_subscriptions where endpoint=$1',[subscription.endpoint])).rows[0];
      if(existing&&['auth','p256dh'].some(key=>existing.subscription.keys[key]!==subscription.keys[key]))throw new Error('INVALID_PUSH_SUBSCRIPTION');
      if(existing&&existing.user_id!==user)await tx.query('delete from game_private.push_deliveries where subscription_id=$1',[existing.id]);
      if(!existing&&(await tx.query('select count(*)::integer as n from game_private.push_subscriptions where user_id=$1',[user])).rows[0].n>=10)throw new Error('INVALID_PUSH_DEVICE_LIMIT');
      await tx.query('insert into game_private.push_subscriptions(user_id,endpoint,subscription,lang) values($1,$2,$3,$4) on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription,lang=excluded.lang,updated_at=now()',[user,subscription.endpoint,JSON.stringify(subscription),lang]);
    });
    return {enabled:true};
  }
  async function unsubscribe(user,endpoint){await db.query('delete from game_private.push_subscriptions where user_id=$1 and endpoint=$2',[user,endpoint]);return {enabled:false};}
  async function status(user,endpoint){const result=await db.query('select 1 from game_private.push_subscriptions where user_id=$1 and endpoint=$2',[user,endpoint]);return {enabled:result.rows.length>0};}
  async function deliver(subscription,payload,ttl){
    validateSubscription(subscription);
    return send(subscription,JSON.stringify(payload),{...options,TTL:Math.max(1,Math.floor(ttl)),urgency:payload.kind==='call'?'high':'normal',topic:createHash('sha256').update(payload.tag).digest('base64url').slice(0,32)});
  }
  async function test(user,endpoint){
    const row=(await db.query('select * from game_private.push_subscriptions where user_id=$1 and endpoint=$2',[user,endpoint])).rows[0];
    if(!row)throw new Error('INVALID_PUSH_SUBSCRIPTION');
    const ru=row.lang==='ru';
    try{await deliver(row.subscription,{title:'GuessWho Arena',body:ru?'Уведомления работают. Друзья теперь смогут дозваться тебя!':'Notifications work. Your friends can now reach you!',tag:'push-test',url:'/settings',kind:'test'},60);}catch(error){if([404,410].includes(error.statusCode))await unsubscribe(user,endpoint);throw new Error('INVALID_PUSH_DELIVERY');}
    return {sent:true};
  }
  async function drain(){
    await db.query('delete from game_private.push_deliveries where expires_at<=now()');
    const rows=(await db.query(`select d.*,s.subscription,s.user_id,s.lang,p.username,
      game_private.are_friends(d.sender_id,s.user_id) as friends,
      case when d.kind='message' then exists(select 1 from game_private.direct_reads r where r.user_id=s.user_id and r.peer_id=d.sender_id and r.last_id>=d.event_id::bigint) else false end as already_read,
      case when d.kind='call' then exists(select 1 from game_private.direct_calls c where c.id::text=d.event_id and c.status='ringing' and c.created_at>now()-interval '45 seconds') else true end as relevant
      from game_private.push_deliveries d join game_private.push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=d.sender_id
      where d.available_at<=now() order by case when d.kind='call' then 0 else 1 end,d.id limit 40`)).rows;
    await Promise.all(rows.map(async row=>{
      if(stopped)return;
      if(row.friends&&!row.already_read&&row.relevant){
        const ru=row.lang==='ru',call=row.kind==='call';
        const payload={title:row.username,body:call?(ru?'Входящий звонок · нажми, чтобы ответить':'Incoming call · tap to answer'):(ru?'Новое личное сообщение':'New private message'),expiredBody:ru?'Пропущенный звонок':'Missed call',kind:row.kind,tag:call?`call-${row.event_id}`:`message-${row.sender_id}`,url:`/messages?user=${row.sender_id}`,expiresAt:new Date(row.expires_at).getTime()};
        try{await deliver(row.subscription,payload,(new Date(row.expires_at).getTime()-Date.now())/1000);}catch(error){
          if([404,410].includes(error.statusCode))await db.query('delete from game_private.push_subscriptions where id=$1',[row.subscription_id]);
          else if(row.attempts<3&&(!error.statusCode||error.statusCode===429||error.statusCode>=500)){
            await db.query("update game_private.push_deliveries set attempts=attempts+1,available_at=now()+($2 * interval '1 second') where id=$1",[row.id,2**(row.attempts+1)]);return;
          }else console.error('Push delivery failed:',error.statusCode||'transport');
        }
      }
      await db.query('delete from game_private.push_deliveries where id=$1',[row.id]);
    }));
  }
  function flush(){if(stopped)return Promise.resolve();if(!running)running=drain().finally(()=>{running=null;});return running;}
  const timer=autoStart?setInterval(()=>void flush().catch(()=>console.error('Push queue unavailable')),1000):null;timer?.unref();
  return {publicKey:keys.publicKey,subscribe,unsubscribe,status,test,flush,close:async()=>{stopped=true;clearInterval(timer);await running;}};
}
