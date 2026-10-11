import {beforeAll,afterAll,test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../server/database.mjs';
let backend:Awaited<ReturnType<typeof createDatabase>>;
beforeAll(async()=>{backend=await createDatabase('memory://');},30000);
afterAll(()=>backend.close());
async function friends(){const a=await backend.session('','Social A'),b=await backend.session('','Social B'),c=await backend.session('','Social Stranger');await backend.call(a.profile.id,'request_friend',{p_code:b.profile.friend_code});await backend.call(b.profile.id,'respond_friend',{p_user:a.profile.id,p_accept:true});return{a,b,c};}
test('friends see online and last seen, multiple tabs stay online and invisible mode hides timestamps in every response',async()=>{
 const {a,b,c}=await friends();await backend.call(a.profile.id,'player_presence',{p_connection:'one'});await backend.call(a.profile.id,'player_presence',{p_connection:'two'});
 let player=await backend.call(b.profile.id,'get_player',{p_user:a.profile.id});expect(player.presence).toBe('online');expect(player.last_seen).toBeTruthy();
 expect(await backend.call(c.profile.id,'get_player',{p_user:a.profile.id})).toMatchObject({presence:'hidden',last_seen:null});
 await backend.call(a.profile.id,'player_presence',{p_connection:'one',p_online:false});expect((await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).presence).toBe('online');
 await backend.call(a.profile.id,'player_presence',{p_connection:'two',p_online:false});expect((await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).presence).toBe('offline');
 await backend.call(a.profile.id,'set_presence_privacy',{p_hidden:true});
 expect(await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).toMatchObject({presence:'hidden',last_seen:null});
 expect((await backend.call(b.profile.id,'get_friends')).friends.find(f=>f.id===a.profile.id)).toMatchObject({presence:'hidden',last_seen:null});
 expect((await backend.call(b.profile.id,'list_conversations')).find(f=>f.id===a.profile.id).activity).toEqual({presence:'hidden',last_seen:null});
 await backend.call(a.profile.id,'set_presence_privacy',{p_hidden:false});
 await backend.call(a.profile.id,'player_presence',{p_connection:'three'});
 await backend.db.query("update game_private.player_sessions set last_seen=now()-interval '46 seconds' where user_id=$1",[a.profile.id]);
 expect((await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).presence).toBe('offline');
});
test('public profiles expose presentation and statistics without coins, private settings, codes or inventory',async()=>{
 const {a,b}=await friends();const player=await backend.call(b.profile.id,'get_player',{p_user:a.profile.id});
 for(const key of ['coins','owned','friend_code','hide_presence','special_titles','level_bonus'])expect(player).not.toHaveProperty(key);
 const photo='data:image/webp;base64,'+readFileSync('public/images/walking-dead/glenn-rhee-color.webp').toString('base64');
 await backend.call(a.profile.id,'update_banner',{p_color:'#8364CA',p_image:photo});
 expect(await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).toMatchObject({banner_color:'#8364ca',banner_image:photo});
 for(const p_image of ['https://evil.test/image.svg','data:image/webp;base64,abcd','data:image/svg+xml;base64,aaaa'])await expect(backend.call(a.profile.id,'update_banner',{p_color:'#000000',p_image})).rejects.toThrow('INVALID_BANNER');
 await expect(backend.call(a.profile.id,'update_banner',{p_color:'red'})).rejects.toThrow('INVALID_BANNER');
 await backend.call(a.profile.id,'update_banner',{p_color:'#123456'});expect((await backend.call(b.profile.id,'get_player',{p_user:a.profile.id})).banner_image).toBeNull();
});
test('direct messages persist, are isolated, deduplicate retries and track unread per recipient',async()=>{
 const {a,b,c}=await friends(),nonce=randomUUID();
 await expect(backend.call(c.profile.id,'send_direct_message',{p_user:a.profile.id,p_body:'Hello',p_nonce:nonce})).rejects.toThrow('INVALID_FRIEND');
 const first=await backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'Hello 👋',p_nonce:nonce});
 expect(await backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'Hello 👋',p_nonce:nonce})).toEqual(first);
 await expect(backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'Changed',p_nonce:nonce})).rejects.toThrow('INVALID_NONCE');
 expect((await backend.call(b.profile.id,'get_direct_messages',{p_user:a.profile.id}))).toHaveLength(1);
 await expect(backend.call(c.profile.id,'get_direct_messages',{p_user:a.profile.id})).rejects.toThrow('INVALID_FRIEND');
 expect((await backend.call(b.profile.id,'social_state')).unread).toBe(1);expect((await backend.call(a.profile.id,'social_state')).unread).toBe(0);
 await backend.call(b.profile.id,'mark_direct_read',{p_user:a.profile.id,p_through:first.id});expect((await backend.call(b.profile.id,'social_state')).unread).toBe(0);
 await expect(backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'🔥',p_nonce:randomUUID()})).rejects.toThrow('NOT_OWNED');
 await backend.db.query("update public.profiles set owned=array['emoji-fire']::text[] where id=$1",[a.profile.id]);
 await backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'🔥',p_nonce:randomUUID()});
 await backend.call(a.profile.id,'remove_friend',{p_user:b.profile.id});
 expect((await backend.call(b.profile.id,'get_direct_messages',{p_user:a.profile.id}))).toHaveLength(2);
 await expect(backend.call(a.profile.id,'send_direct_message',{p_user:b.profile.id,p_body:'Hello',p_nonce:randomUUID()})).rejects.toThrow('INVALID_FRIEND');
});
test('message history pages do not cross conversations and old read receipts cannot reset unread counters',async()=>{
 const {a,b,c}=await friends();
 for(let i=0;i<63;i++)await backend.db.query('insert into game_private.direct_messages(sender_id,recipient_id,body,nonce) values($1,$2,$3,$4)',[a.profile.id,b.profile.id,'Message '+i,randomUUID()]);
 const recent=await backend.call(b.profile.id,'get_direct_messages',{p_user:a.profile.id});expect(recent).toHaveLength(50);
 const older=await backend.call(b.profile.id,'get_direct_messages',{p_user:a.profile.id,p_before:recent[0].id});expect(older).toHaveLength(13);
 await backend.call(b.profile.id,'mark_direct_read',{p_user:a.profile.id,p_through:recent.at(-1).id});await backend.call(b.profile.id,'mark_direct_read',{p_user:a.profile.id,p_through:older[0].id});expect((await backend.call(b.profile.id,'social_state')).unread).toBe(0);
 expect((await backend.call(c.profile.id,'list_conversations'))).toEqual([]);
});
test('calls require friendship and explicit acceptance; outsiders cannot join, answer or end calls',async()=>{
 const {a,b,c}=await friends();
 await expect(backend.call(c.profile.id,'start_direct_call',{p_user:a.profile.id})).rejects.toThrow('INVALID_FRIEND');
 const call=await backend.call(a.profile.id,'start_direct_call',{p_user:b.profile.id});
 expect(await backend.call(a.profile.id,'can_direct_voice',{p_call:call.id})).toBe(false);
 expect((await backend.call(b.profile.id,'social_state')).call).toMatchObject({id:call.id,status:'ringing',caller_id:a.profile.id});
 await expect(backend.call(a.profile.id,'start_direct_call',{p_user:b.profile.id})).rejects.toThrow('INVALID_CALL_BUSY');
 for(const user of [a,c])await expect(backend.call(user.profile.id,'answer_direct_call',{p_call:call.id,p_accept:true})).rejects.toThrow('INVALID_CALL');
 await expect(backend.call(c.profile.id,'end_direct_call',{p_call:call.id})).rejects.toThrow('INVALID_CALL');
 await backend.call(b.profile.id,'answer_direct_call',{p_call:call.id,p_accept:true});
 expect(await backend.call(a.profile.id,'can_direct_voice',{p_call:call.id})).toBe(true);expect(await backend.call(b.profile.id,'can_direct_voice',{p_call:call.id})).toBe(true);expect(await backend.call(c.profile.id,'can_direct_voice',{p_call:call.id})).toBe(false);
 await backend.call(a.profile.id,'remove_friend',{p_user:b.profile.id});expect(await backend.call(a.profile.id,'can_direct_voice',{p_call:call.id})).toBe(false);expect((await backend.call(b.profile.id,'social_state')).call).toBeNull();
});
test('ringing calls expire and active calls end after a participant disappears',async()=>{
 const {a,b}=await friends();let call=await backend.call(a.profile.id,'start_direct_call',{p_user:b.profile.id});
 await backend.db.query("update game_private.direct_calls set created_at=now()-interval '46 seconds' where id=$1",[call.id]);expect((await backend.call(b.profile.id,'social_state')).call).toBeNull();
 call=await backend.call(a.profile.id,'start_direct_call',{p_user:b.profile.id});await backend.call(b.profile.id,'answer_direct_call',{p_call:call.id,p_accept:false});expect((await backend.call(a.profile.id,'social_state')).call).toBeNull();
 call=await backend.call(a.profile.id,'start_direct_call',{p_user:b.profile.id});await backend.call(b.profile.id,'answer_direct_call',{p_call:call.id,p_accept:true});
 await backend.db.query("update game_private.direct_calls set callee_seen=now()-interval '46 seconds' where id=$1",[call.id]);expect((await backend.call(a.profile.id,'social_state')).call).toBeNull();expect(await backend.call(a.profile.id,'can_direct_voice',{p_call:call.id})).toBe(false);
});
test('stale queued board changes cannot alter the next turn or round',async()=>{
 const {a,b}=await friends();const room=await backend.call(a.profile.id,'create_room',{p_category:'naruto'});await backend.call(b.profile.id,'join_room',{p_code:room.code});
 await backend.call(a.profile.id,'select_secret',{p_room:room.id,p_character:'naruto-naruto-uzumaki'});await backend.call(b.profile.id,'select_secret',{p_room:room.id,p_character:'naruto-sasuke-uchiha'});
 const view=await backend.call(a.profile.id,'get_game',{p_room:room.id});expect(view.room.card_count).toBe(32);
 await backend.call(a.profile.id,'pass_turn',{p_room:room.id});await backend.call(b.profile.id,'pass_turn',{p_room:room.id});
 await expect(backend.call(a.profile.id,'set_board',{p_room:room.id,p_closed:['naruto-itachi-uchiha'],p_round:1,p_move:0,p_revision:0})).rejects.toThrow('INVALID_STALE_BOARD');
 expect((await backend.call(a.profile.id,'get_game',{p_room:room.id})).own_closed).toBeNull();
});
