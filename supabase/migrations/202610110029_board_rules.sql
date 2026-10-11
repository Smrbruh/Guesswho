create or replace function game_private.resolve_guess(p_room uuid,p_character text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms; opponent uuid; target text; correct boolean; result jsonb;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null or r.status!='playing' or r.turn_id!=auth.uid() then raise exception 'NOT_YOUR_TURN'; end if;
  if not game_private.room_has_character(r,p_character) then raise exception 'INVALID_CHARACTER'; end if;
  opponent:=case when r.host_id=auth.uid() then r.guest_id else r.host_id end;
  select character_id into target from game_private.secrets where room_id=p_room and user_id=opponent;
  correct:=target=p_character;
  if not correct then
    insert into game_private.boards(room_id,user_id,closed,version) values(p_room,auth.uid(),array[p_character],1) on conflict(room_id,user_id) do update set closed=case when p_character=any(game_private.boards.closed) then game_private.boards.closed else array_append(game_private.boards.closed,p_character) end,version=game_private.boards.version+1;
  end if;
  if r.pending_winner is not null then
    result:=game_private.complete_match(p_room,case when correct then null else r.pending_winner end,false);
    return result||jsonb_build_object('correct',correct);
  end if;
  update public.rooms set turn_id=opponent,moves=moves+1,pending_winner=case when correct then auth.uid() else null end where id=p_room;
  return jsonb_build_object('correct',correct,'last_chance',correct,'winner_id',null,'reward',0);
end $$;

revoke all on function game_private.resolve_guess(uuid,text) from public,anon,authenticated;
create or replace function public.guess_character(p_room uuid,p_character text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null or r.status!='playing' or r.turn_id!=auth.uid() then raise exception 'NOT_YOUR_TURN'; end if;
  if r.pending_winner is null and exists(select 1 from game_private.boards where room_id=p_room and user_id=auth.uid() and closed_move=r.moves) then raise exception 'INVALID_GUESS_AFTER_CLOSE'; end if;
  return game_private.resolve_guess(p_room,p_character);
end $$;
create or replace function public.set_board(p_room uuid,p_closed jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; cards text[]; previous text[]; b game_private.boards; added boolean; remaining text[]; answer jsonb;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status!='playing' then raise exception 'INVALID_STATE'; end if;
  if r.turn_id!=auth.uid() then raise exception 'NOT_YOUR_TURN'; end if;
  if r.pending_winner is not null then raise exception 'FINAL_GUESS_REQUIRED'; end if;
  if p_closed is null or jsonb_typeof(p_closed)!='array' then raise exception 'INVALID_BOARD'; end if;
  if jsonb_array_length(p_closed)>64 or exists(select 1 from jsonb_array_elements(p_closed) c where jsonb_typeof(c)!='string') then raise exception 'INVALID_BOARD'; end if;
  select coalesce(array_agg(distinct c),'{}') into cards from jsonb_array_elements_text(p_closed) c;
  if exists(select 1 from unnest(cards) c where not game_private.room_has_character(r,c)) then raise exception 'INVALID_CHARACTER'; end if;
  select closed into previous from game_private.boards where room_id=p_room and user_id=auth.uid();
  added:=exists(select 1 from unnest(cards) c where not(c=any(coalesce(previous,'{}'))));
  insert into game_private.boards(room_id,user_id,closed,version,closed_move) values(p_room,auth.uid(),cards,1,case when added then r.moves else -1 end) on conflict(room_id,user_id) do update set closed=excluded.closed,version=game_private.boards.version+1,closed_move=case when added then r.moves else game_private.boards.closed_move end returning * into b;
  select array_agg(c->>'id') into remaining from jsonb_array_elements(r.deck->'characters') c where not(c->>'id'=any(cards));
  if added and cardinality(remaining)=1 and cardinality(cards)>cardinality(coalesce(previous,'{}')) then
    answer:=game_private.resolve_guess(p_room,remaining[1]);
    select * into b from game_private.boards where room_id=p_room and user_id=auth.uid();
  end if;
  return jsonb_build_object('closed',b.closed,'version',b.version)||case when answer is not null then jsonb_build_object('automatic_guess',answer) else '{}'::jsonb end;
end $$;
create or replace function public.get_game(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; s text; m jsonb; players jsonb;
begin
  perform game_private.expire_rooms();
  select * into r from public.rooms where id=p_room and auth.uid() in (host_id,guest_id);
  if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  select character_id into s from game_private.secrets where room_id=p_room and user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at),'[]'::jsonb) into m from (select id,sender_id,username,body,created_at from public.game_messages where room_id=p_room order by created_at desc limit 100) recent;
  select jsonb_object_agg(id::text,jsonb_build_object('avatar',avatar,'title',title,'rating',rating,'frame',frame,'staff_badge',staff_badge)) into players from public.profiles where id in (r.host_id,r.guest_id);
  return jsonb_build_object('room',(to_jsonb(r)-'deck'||jsonb_build_object('category_title',r.deck->>'title','category_title_en',r.deck->>'titleEn')),'friendship',coalesce((select case when f.status='accepted' then 'friends' when f.requester=auth.uid() then 'outgoing' else 'incoming' end from game_private.friendships f where (f.requester=r.host_id and f.recipient=r.guest_id) or (f.requester=r.guest_id and f.recipient=r.host_id)),'none'),'voice_allowed',public.can_voice(p_room),'secret',s,'messages',m,'players',players,'guess_locked',exists(select 1 from game_private.boards where room_id=p_room and user_id=auth.uid() and closed_move=r.moves) and r.pending_winner is null,'own_closed',(select to_jsonb(closed) from game_private.boards where room_id=p_room and user_id=auth.uid()),'own_board_version',coalesce((select version from game_private.boards where room_id=p_room and user_id=auth.uid()),0),'opponent_closed',coalesce((select to_jsonb(closed) from game_private.boards where room_id=p_room and user_id=case when r.host_id=auth.uid() then r.guest_id else r.host_id end),'[]'::jsonb));
end;
$$;
