create table game_private.reaction_items(id text primary key,glyph text unique not null);
revoke all on game_private.reaction_items from public,anon,authenticated;
insert into game_private.reaction_items values('emoji-love','🥰'),('emoji-mindblown','🤯'),('emoji-party','🥳'),('emoji-melt','🫠'),('emoji-shock','😱'),('emoji-spy','🥸'),('emoji-fire','🔥'),('emoji-brain','🧠'),('emoji-crown','👑'),('emoji-devil','😈'),('emoji-clown','🤡'),('emoji-skull','💀'),('emoji-yawn','🥱'),('emoji-salt','🧂'),('emoji-ez','GG EZ'),('emoji-rage','😤'),('emoji-ice','🥶'),('emoji-goat','🐐'),('emoji-sus','🤨'),('emoji-cry','🥲'),('emoji-cook','🧑‍🍳'),('emoji-popcorn','🍿'),('emoji-nerd','🤓'),('emoji-smirk','😏'),('emoji-bye','👋');
create table game_private.direct_messages(id bigint generated always as identity primary key,sender_id uuid not null references public.profiles(id),recipient_id uuid not null references public.profiles(id),body text not null,nonce uuid not null,created_at timestamptz not null default now(),unique(sender_id,nonce),check(sender_id!=recipient_id));
create index direct_message_pair on game_private.direct_messages(least(sender_id,recipient_id),greatest(sender_id,recipient_id),id desc);
create table game_private.direct_reads(user_id uuid not null references public.profiles(id),peer_id uuid not null references public.profiles(id),last_id bigint not null default 0,primary key(user_id,peer_id));
revoke all on game_private.direct_messages,game_private.direct_reads from public,anon,authenticated;
create function public.send_direct_message(p_user uuid,p_body text,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m game_private.direct_messages; v text:=trim(p_body); item text;
begin
  perform id from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'UNAUTHORIZED'; end if;
  if not game_private.are_friends(auth.uid(),p_user) then raise exception 'INVALID_FRIEND'; end if;
  if v is null or length(v) not between 1 and 1000 or p_nonce is null then raise exception 'INVALID_MESSAGE'; end if;
  select * into m from game_private.direct_messages where sender_id=auth.uid() and nonce=p_nonce;
  if m.id is not null then
    if m.recipient_id!=p_user or m.body!=v then raise exception 'INVALID_NONCE'; end if;
    return to_jsonb(m)-'nonce';
  end if;
  if (select count(*) from game_private.direct_messages where sender_id=auth.uid() and created_at>now()-interval '10 seconds')>=12 then raise exception 'RATE_LIMIT'; end if;
  select id into item from game_private.reaction_items where glyph=v;
  if item is not null and not exists(select 1 from public.profiles where id=auth.uid() and item=any(owned)) then raise exception 'NOT_OWNED'; end if;
  insert into game_private.direct_messages(sender_id,recipient_id,body,nonce) values(auth.uid(),p_user,v,p_nonce) returning * into m;
  return to_jsonb(m)-'nonce';
end $$;
create function public.get_direct_messages(p_user uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if not game_private.are_friends(auth.uid(),p_user) and not exists(select 1 from game_private.direct_messages where (sender_id=auth.uid() and recipient_id=p_user) or (recipient_id=auth.uid() and sender_id=p_user)) then raise exception 'INVALID_FRIEND'; end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from (select id,sender_id,recipient_id,body,created_at from game_private.direct_messages where ((sender_id=auth.uid() and recipient_id=p_user) or (recipient_id=auth.uid() and sender_id=p_user)) and (p_before is null or id<p_before) order by id desc limit 50) m),'[]');
end $$;
create function public.mark_direct_read(p_user uuid,p_through bigint) returns void language plpgsql security definer set search_path='' as $$
declare last_message bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select max(id) into last_message from game_private.direct_messages where recipient_id=auth.uid() and sender_id=p_user and id<=p_through;
  if last_message is not null then insert into game_private.direct_reads values(auth.uid(),p_user,last_message) on conflict(user_id,peer_id) do update set last_id=greatest(game_private.direct_reads.last_id,excluded.last_id); end if;
end $$;
create function public.list_conversations() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)-'sort_at' order by r.sort_at desc nulls last,r.username) from (select p.id,p.username,p.avatar,p.frame,p.staff_badge,game_private.are_friends(p.id,auth.uid()) as friends,game_private.presence_for(p.id) as activity,(select jsonb_build_object('body',m.body,'created_at',m.created_at,'sender_id',m.sender_id) from game_private.direct_messages m where (m.sender_id=auth.uid() and m.recipient_id=p.id) or (m.recipient_id=auth.uid() and m.sender_id=p.id) order by m.id desc limit 1) as last_message,(select count(*) from game_private.direct_messages m where m.sender_id=p.id and m.recipient_id=auth.uid() and m.id>coalesce((select last_id from game_private.direct_reads where user_id=auth.uid() and peer_id=p.id),0)) as unread,(select max(created_at) from game_private.direct_messages m where (m.sender_id=auth.uid() and m.recipient_id=p.id) or (m.recipient_id=auth.uid() and m.sender_id=p.id)) as sort_at from public.profiles p where p.id!=auth.uid() and (game_private.are_friends(p.id,auth.uid()) or exists(select 1 from game_private.direct_messages m where (m.sender_id=auth.uid() and m.recipient_id=p.id) or (m.recipient_id=auth.uid() and m.sender_id=p.id)))) r),'[]');
end $$;
revoke all on function public.send_direct_message(uuid,text,uuid),public.get_direct_messages(uuid,bigint),public.mark_direct_read(uuid,bigint),public.list_conversations() from public,anon;
grant execute on function public.send_direct_message(uuid,text,uuid),public.get_direct_messages(uuid,bigint),public.mark_direct_read(uuid,bigint),public.list_conversations() to authenticated;

create table game_private.direct_calls(id uuid primary key default gen_random_uuid(),caller_id uuid not null references public.profiles(id),callee_id uuid not null references public.profiles(id),status text not null default 'ringing' check(status in('ringing','active','ended','declined','missed')),created_at timestamptz not null default now(),answered_at timestamptz,ended_at timestamptz,caller_seen timestamptz not null default now(),callee_seen timestamptz not null default now(),check(caller_id!=callee_id));
revoke all on game_private.direct_calls from public,anon,authenticated;
create function game_private.expire_direct_calls() returns void language plpgsql security definer set search_path='' as $$
begin
  update game_private.direct_calls set status=case when status='ringing' then 'missed' else 'ended' end,ended_at=now() where (status='ringing' and created_at<now()-interval '45 seconds') or (status='active' and least(caller_seen,callee_seen)<now()-interval '45 seconds') or (status in('ringing','active') and not game_private.are_friends(caller_id,callee_id));
end $$;
revoke all on function game_private.expire_direct_calls() from public,anon,authenticated;
create function public.start_direct_call(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c game_private.direct_calls;
begin
  if not game_private.are_friends(auth.uid(),p_user) then raise exception 'INVALID_FRIEND'; end if;
  perform id from public.profiles where id in(auth.uid(),p_user) order by id for update;
  perform game_private.expire_direct_calls();
  if exists(select 1 from game_private.direct_calls where status in('ringing','active') and (caller_id in(auth.uid(),p_user) or callee_id in(auth.uid(),p_user))) then raise exception 'INVALID_CALL_BUSY'; end if;
  if (select count(*) from game_private.direct_calls where caller_id=auth.uid() and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMIT'; end if;
  insert into game_private.direct_calls(caller_id,callee_id) values(auth.uid(),p_user) returning * into c;
  return jsonb_build_object('id',c.id,'caller_id',c.caller_id,'callee_id',c.callee_id,'status',c.status,'created_at',c.created_at,'answered_at',c.answered_at,'peer',public.get_player(p_user)-'banner_image'-'category_wins');
end $$;
create function public.answer_direct_call(p_call uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare c game_private.direct_calls;
begin
  perform game_private.expire_direct_calls();
  select * into c from game_private.direct_calls where id=p_call and callee_id=auth.uid() for update;
  if c.id is null or c.status!='ringing' or p_accept is null or not game_private.are_friends(c.caller_id,c.callee_id) then raise exception 'INVALID_CALL'; end if;
  update game_private.direct_calls set status=case when p_accept then 'active' else 'declined' end,answered_at=case when p_accept then now() else null end,ended_at=case when p_accept then null else now() end,caller_seen=now(),callee_seen=now() where id=p_call;
end $$;
create function public.end_direct_call(p_call uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from game_private.direct_calls where id=p_call and auth.uid() in(caller_id,callee_id)) then raise exception 'INVALID_CALL'; end if;
  update game_private.direct_calls set status='ended',ended_at=now() where id=p_call and status in('ringing','active');
end $$;
create function public.can_direct_voice(p_call uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from game_private.direct_calls where id=p_call and status='active' and auth.uid() in(caller_id,callee_id) and least(caller_seen,callee_seen)>now()-interval '45 seconds' and game_private.are_friends(caller_id,callee_id)) $$;
create function public.social_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare c game_private.direct_calls; unread bigint; latest jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  perform game_private.expire_direct_calls();
  update game_private.direct_calls set caller_seen=case when caller_id=auth.uid() then now() else caller_seen end,callee_seen=case when callee_id=auth.uid() then now() else callee_seen end where status='active' and auth.uid() in(caller_id,callee_id);
  select * into c from game_private.direct_calls where auth.uid() in(caller_id,callee_id) and status in('ringing','active') order by created_at desc limit 1;
  select count(*) into unread from game_private.direct_messages m where m.recipient_id=auth.uid() and m.id>coalesce((select last_id from game_private.direct_reads where user_id=auth.uid() and peer_id=m.sender_id),0);
  select jsonb_build_object('id',m.id,'user_id',m.sender_id,'username',p.username) into latest from game_private.direct_messages m join public.profiles p on p.id=m.sender_id where m.recipient_id=auth.uid() order by m.id desc limit 1;
  return jsonb_build_object('unread',unread,'latest',latest,'call',case when c.id is null then null else jsonb_build_object('id',c.id,'caller_id',c.caller_id,'callee_id',c.callee_id,'status',c.status,'created_at',c.created_at,'answered_at',c.answered_at,'peer',public.get_player(case when c.caller_id=auth.uid() then c.callee_id else c.caller_id end)-'banner_image'-'category_wins') end);
end $$;
revoke all on function public.start_direct_call(uuid),public.answer_direct_call(uuid,boolean),public.end_direct_call(uuid),public.can_direct_voice(uuid),public.social_state() from public,anon;
grant execute on function public.start_direct_call(uuid),public.answer_direct_call(uuid,boolean),public.end_direct_call(uuid),public.can_direct_voice(uuid),public.social_state() to authenticated;

alter policy voice_read on realtime.messages to authenticated using (
  exists(select 1 from public.rooms r where 'voice:'||r.id::text=realtime.topic() and public.can_voice(r.id)) or case when realtime.topic() ~ '^direct:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.can_direct_voice(substring(realtime.topic() from 8)::uuid) else false end
);
alter policy voice_write on realtime.messages to authenticated with check (
  exists(select 1 from public.rooms r where 'voice:'||r.id::text=realtime.topic() and public.can_voice(r.id)) or case when realtime.topic() ~ '^direct:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.can_direct_voice(substring(realtime.topic() from 8)::uuid) else false end
);
