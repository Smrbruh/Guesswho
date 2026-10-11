alter function public.set_board(uuid,jsonb) set schema game_private;
revoke all on function game_private.set_board(uuid,jsonb) from public,anon,authenticated;
create function public.set_board(p_room uuid,p_closed jsonb,p_round integer default null,p_move integer default null,p_revision integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if (p_round is not null and r.round_number!=p_round) or (p_move is not null and r.moves!=p_move) or (p_revision is not null and r.deck_revision!=p_revision) then raise exception 'INVALID_STALE_BOARD'; end if;
  return game_private.set_board(p_room,p_closed);
end $$;
revoke all on function public.set_board(uuid,jsonb,integer,integer,integer) from public,anon;
grant execute on function public.set_board(uuid,jsonb,integer,integer,integer) to authenticated;
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
  return jsonb_build_object('room',(to_jsonb(r)-'deck'||jsonb_build_object('card_count',jsonb_array_length(r.deck->'characters'),'category_title',r.deck->>'title','category_title_en',r.deck->>'titleEn')),'friendship',coalesce((select case when f.status='accepted' then 'friends' when f.requester=auth.uid() then 'outgoing' else 'incoming' end from game_private.friendships f where (f.requester=r.host_id and f.recipient=r.guest_id) or (f.requester=r.guest_id and f.recipient=r.host_id)),'none'),'voice_allowed',public.can_voice(p_room),'secret',s,'messages',m,'players',players,'guess_locked',exists(select 1 from game_private.boards where room_id=p_room and user_id=auth.uid() and closed_move=r.moves) and r.pending_winner is null,'own_closed',(select to_jsonb(closed) from game_private.boards where room_id=p_room and user_id=auth.uid()),'own_board_version',coalesce((select version from game_private.boards where room_id=p_room and user_id=auth.uid()),0),'opponent_closed',coalesce((select to_jsonb(closed) from game_private.boards where room_id=p_room and user_id=case when r.host_id=auth.uid() then r.guest_id else r.host_id end),'[]'::jsonb));
end;
$$;
