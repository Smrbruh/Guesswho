import {beforeAll,afterAll,test,expect} from 'vitest';
import {createDatabase} from '../server/database.mjs';
import catalog from '../src/data/catalog.json';
import {titles} from '../src/lib/achievements';
let backend:Awaited<ReturnType<typeof createDatabase>>;
const expanded=catalog.filter(d=>['walking-dead','jojo','avatar-aang'].includes(d.id));
beforeAll(async()=>{backend=await createDatabase('memory://');},30000);
afterAll(()=>backend.close());

test.each(expanded)('$id supports the complete official lineup, remixes, practice and online matches',async(deck)=>{
  const host=await backend.session('',deck.id+' Host'),guest=await backend.session('',deck.id+' Guest');
  const saved=await backend.call(host.profile.id,'get_deck',{p_id:deck.id});
  expect(saved.owner_id).toBeNull();expect(saved.published).toBe(true);expect(saved.data).toEqual(deck);
  const listing=await backend.call(guest.profile.id,'list_decks',{p_scope:'official'});
  expect(listing.find(d=>d.id===deck.id)).toMatchObject({size:48,published:true});
  const copy=await backend.call(host.profile.id,'save_deck',{p_data:deck,p_published:false});
  expect((await backend.call(host.profile.id,'get_deck',{p_id:copy})).data.characters).toEqual(deck.characters);
  await expect(backend.call(guest.profile.id,'start_practice_streak',{p_category:deck.id})).resolves.toBeTruthy();
  const room=await backend.call(host.profile.id,'create_room',{p_category:deck.id,p_ranked:false,p_public:false});
  await backend.call(guest.profile.id,'join_room',{p_code:room.code});
  expect((await backend.call(guest.profile.id,'get_room_deck',{p_room:room.id})).characters).toEqual(deck.characters);
  await backend.call(host.profile.id,'select_secret',{p_room:room.id,p_character:deck.characters[47].id});
  await backend.call(guest.profile.id,'select_secret',{p_room:room.id,p_character:deck.characters[46].id});
  expect((await backend.call(host.profile.id,'get_game',{p_room:room.id})).secret).toBe(deck.characters[47].id);
  await expect(backend.call(host.profile.id,'guess_character',{p_room:room.id,p_character:'naruto-naruto-uzumaki'})).rejects.toThrow('INVALID_CHARACTER');
  expect((await backend.call(host.profile.id,'guess_character',{p_room:room.id,p_character:deck.characters[46].id})).last_chance).toBe(true);
  expect((await backend.call(guest.profile.id,'guess_character',{p_room:room.id,p_character:deck.characters[47].id})).draw).toBe(true);
});

test('JoJo wins count toward anime achievements in the client and on the server',async()=>{
  const {profile}=await backend.session('','JoJo Achievement');
  await backend.db.query('update public.profiles set category_wins=$1 where id=$2',[JSON.stringify({jojo:5}),profile.id]);
  const updated=await backend.call(profile.id,'ensure_profile');
  expect(titles.find(t=>t.id==='senpai')!.progress(updated)).toBe(5);
  expect((await backend.call(profile.id,'equip_title',{p_title:'senpai'})).title).toBe('senpai');
  await expect(backend.call(profile.id,'equip_title',{p_title:'sensei'})).rejects.toThrow('NOT_OWNED');
});
