import {beforeAll,afterAll,test,expect} from 'vitest';
import {createDatabase} from '../server/database.mjs';
import catalog from '../src/data/catalog.json';
import {shopItems} from '../src/lib/game';
let backend:Awaited<ReturnType<typeof createDatabase>>;
beforeAll(async()=>{backend=await createDatabase('memory://');},30000);
afterAll(()=>backend.close());
const pack=(title:string)=>({...catalog[0],title,titleEn:title,characters:catalog[0].characters.slice(0,6)});

test('shop catalog agrees with prices and new frames require ownership',async()=>{
  const {profile}=await backend.session('','Shop Collector');
  await backend.db.query('update public.profiles set coins=10000 where id=$1',[profile.id]);
  const prices=await backend.db.query('select id,price from game_private.shop_items');
  expect(prices.rows).toHaveLength(shopItems.length);
  for(const item of shopItems)expect(prices.rows).toContainEqual({id:item.id,price:item.price});
  await expect(backend.call(profile.id,'equip_frame',{p_item:'frame-aurora'})).rejects.toThrow('NOT_OWNED');
  const purchased=await backend.call(profile.id,'buy_item',{p_item:'frame-aurora'});
  expect(purchased.coins).toBe(9600);
  expect((await backend.call(profile.id,'buy_item',{p_item:'frame-aurora'})).coins).toBe(9600);
  expect((await backend.call(profile.id,'equip_frame',{p_item:'frame-aurora'})).frame).toBe('frame-aurora');
  await backend.call(profile.id,'buy_item',{p_item:'emoji-love'});
  await expect(backend.call(profile.id,'equip_frame',{p_item:'emoji-love'})).rejects.toThrow('NOT_OWNED');
  expect((await backend.call(profile.id,'ensure_profile')).coins).toBe(9440);
});

test('pack visibility filters never disclose another user private pack',async()=>{
  const a=await backend.session('','Discovery Author'),b=await backend.session('','Discovery Reader');
  const privateId=await backend.call(a.profile.id,'save_deck',{p_data:pack('Hidden collection')});
  const publicId=await backend.call(a.profile.id,'save_deck',{p_data:pack('Public collection'),p_published:true});
  const own=await backend.call(a.profile.id,'list_decks',{p_scope:'private'});
  expect(own.map(d=>d.id)).toEqual([privateId]);
  expect((await backend.call(a.profile.id,'list_decks',{p_scope:'mine'})).map(d=>d.id).sort()).toEqual([privateId,publicId].sort());
  for(const scope of ['all','private','mine','community'])expect((await backend.call(b.profile.id,'list_decks',{p_scope:scope})).some(d=>d.id===privateId)).toBe(false);
  expect((await backend.call(b.profile.id,'list_decks',{p_scope:'community'})).some(d=>d.id===publicId)).toBe(true);
  expect((await backend.call(b.profile.id,'list_decks',{p_scope:'official'})).every(d=>d.owner_id===null)).toBe(true);
  await backend.call(a.profile.id,'save_deck',{p_id:publicId,p_data:pack('Public collection'),p_published:false});
  expect((await backend.call(b.profile.id,'list_decks',{p_search:'Public collection'}))).toEqual([]);
  await expect(backend.call(b.profile.id,'get_deck',{p_id:publicId})).rejects.toThrow('DECK_NOT_FOUND');
  await expect(backend.call(b.profile.id,'list_decks',{p_sort:'unsafe'})).rejects.toThrow('INVALID_FILTER');
});

test('trending uses recent net votes while popular uses all votes',async()=>{
  const a=await backend.session('','Trending Author'),b=await backend.session('','Trending Reader'),c=await backend.session('','Trending Reader Two');
  const old=await backend.call(a.profile.id,'save_deck',{p_data:pack('Trend Old'),p_published:true});
  const fresh=await backend.call(a.profile.id,'save_deck',{p_data:pack('Trend Fresh'),p_published:true});
  await backend.call(b.profile.id,'vote_deck',{p_id:old,p_vote:1});await backend.call(c.profile.id,'vote_deck',{p_id:old,p_vote:1});
  await backend.db.query("update public.deck_votes set created_at=now()-interval '8 days' where deck_id=$1",[old]);
  await backend.call(b.profile.id,'vote_deck',{p_id:old,p_vote:1});
  await backend.call(b.profile.id,'vote_deck',{p_id:fresh,p_vote:1});
  const trending=await backend.call(b.profile.id,'list_decks',{p_search:'Trend',p_sort:'trending'});
  expect(trending[0]).toMatchObject({id:fresh,trending:true,recent_likes:1});
  expect(trending[1]).toMatchObject({id:old,trending:false,recent_likes:0});
  expect((await backend.call(b.profile.id,'list_decks',{p_search:'Trend',p_sort:'popular'}))[0].id).toBe(old);
  await backend.call(c.profile.id,'vote_deck',{p_id:fresh,p_vote:-1});
  expect((await backend.call(b.profile.id,'list_decks',{p_search:'Trend Fresh'}))[0]).toMatchObject({trending:false,recent_score:0});
  await backend.call(a.profile.id,'save_deck',{p_id:fresh,p_data:pack('Trend Fresh edited'),p_published:true});
  expect((await backend.call(b.profile.id,'list_decks',{p_search:'Trend Fresh'}))[0]).toMatchObject({trending:false,recent_score:0});
});
