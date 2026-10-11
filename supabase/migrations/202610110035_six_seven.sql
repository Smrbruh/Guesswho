insert into game_private.shop_items(id,price) values('emoji-67',167);
insert into game_private.reaction_items(id,glyph) values('emoji-67','6️⃣7️⃣');
create or replace function public.send_message(p_room uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare n text; v text:=trim(p_body); item text;
begin
  select username into n from public.profiles where id=auth.uid() for update;
  if n is null or not exists(select 1 from public.rooms where id=p_room and auth.uid() in(host_id,guest_id)) then raise exception 'UNAUTHORIZED'; end if;
  if v is null or char_length(v) not between 1 and 300 then raise exception 'INVALID_MESSAGE'; end if;
  if exists(select 1 from public.game_messages where sender_id=auth.uid() and created_at>now()-interval '700 milliseconds') then raise exception 'RATE_LIMIT'; end if;
  select id into item from game_private.reaction_items where glyph=v;
  if item is not null and not exists(select 1 from public.profiles where id=auth.uid() and item=any(owned)) then raise exception 'NOT_OWNED'; end if;
  insert into public.game_messages(room_id,sender_id,username,body) values(p_room,auth.uid(),n,v);
end $$;
