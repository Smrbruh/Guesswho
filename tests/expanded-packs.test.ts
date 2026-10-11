import {beforeAll,afterAll,test,expect} from 'vitest';
import {createDatabase} from '../server/database.mjs';
import catalog from '../src/data/catalog.json';
import {titles,playerLevel,titleById} from '../src/lib/achievements';
let backend:Awaited<ReturnType<typeof createDatabase>>;
const expanded=catalog.filter(d=>d.characters.length===48);
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
  expect((await backend.call(host.profile.id,'get_deck',{p_id:copy})).data.questions).toEqual('questions' in deck ? deck.questions : undefined);
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

test('deck question validation rejects malformed definitions and traits without changing saved decks',async()=>{
  const {profile}=await backend.session('','Question Editor');
  const deck=catalog.find(d=>d.id==='countries')!;
  const copy=await backend.call(profile.id,'save_deck',{p_data:deck,p_published:false});
  const original=(await backend.call(profile.id,'get_deck',{p_id:copy})).data;
  for(const questions of [null,{},[],[{key:'asia',ru:'Азия?',en:'Asia?'},{key:'asia',ru:'Ещё?',en:'Again?'}],[{key:'invalid key',ru:'Вопрос?',en:'Question?'}],[{key:'asia',ru:123,en:'Asia?'}],Array.from({length:25},(_,i)=>({key:`key${i}`,ru:'Вопрос?',en:'Question?'}))]){
    await expect(backend.call(profile.id,'save_deck',{p_id:copy,p_data:{...deck,questions},p_published:false})).rejects.toThrow('INVALID_QUESTIONS');
  }
  const unknown={...deck,characters:deck.characters.map((c,i)=>i===0?{...c,traits:['male']}:c)};
  await expect(backend.call(profile.id,'save_deck',{p_id:copy,p_data:unknown,p_published:false})).rejects.toThrow('INVALID_TRAITS');
  const withoutQuestions={...deck};delete (withoutQuestions as {questions?:unknown}).questions;
  await expect(backend.call(profile.id,'save_deck',{p_id:copy,p_data:withoutQuestions,p_published:false})).rejects.toThrow('INVALID_TRAITS');
  expect((await backend.call(profile.id,'get_deck',{p_id:copy})).data).toEqual(original);
});

test.each(['jojo','pokemon'])('%s wins count toward anime achievements in the client and on the server',async(category)=>{
  const {profile}=await backend.session('',category+' Achievement');
  await backend.db.query('update public.profiles set category_wins=$1 where id=$2',[JSON.stringify({[category]:5}),profile.id]);
  const updated=await backend.call(profile.id,'ensure_profile');
  expect(titles.find(t=>t.id==='senpai')!.progress(updated)).toBe(5);
  expect((await backend.call(profile.id,'equip_title',{p_title:'senpai'})).title).toBe('senpai');
  await expect(backend.call(profile.id,'equip_title',{p_title:'sensei'})).rejects.toThrow('NOT_OWNED');
});

test('Developer is a server-granted title and level bonuses preserve real match statistics',async()=>{
  const {profile}=await backend.session('','Developer Test');
  await expect(backend.call(profile.id,'equip_title',{p_title:'developer'})).rejects.toThrow('NOT_OWNED');
  await backend.db.query("update public.profiles set level_bonus=98,special_titles=array['developer']::text[] where id=$1",[profile.id]);
  const updated=await backend.call(profile.id,'equip_title',{p_title:'developer'});
  expect(updated).toMatchObject({title:'developer',coins:profile.coins,wins:0,games:0,rating:profile.rating});
  expect(playerLevel(updated)).toBe(99);
  expect(playerLevel({...updated,wins:5})).toBe(100);
  expect(titles.find(t=>t.id==='developer')!.progress(updated)).toBe(1);
  expect(titles.find(t=>t.id==='developer')!.progress(profile)).toBe(0);
  expect(titleById('unknown').id).toBe('rookie');
  await backend.call(profile.id,'update_profile',{p_username:'Renamed Developer'});
  await backend.call(profile.id,'equip_title',{p_title:'rookie'});
  expect((await backend.call(profile.id,'equip_title',{p_title:'developer'})).title).toBe('developer');
});
