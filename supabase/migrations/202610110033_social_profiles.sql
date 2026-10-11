alter table public.profiles add column banner_color text not null default '#b8e84a';
alter table public.profiles add column banner_image text;
alter table public.profiles add column hide_presence boolean not null default false;
create table game_private.player_sessions(user_id uuid not null references public.profiles(id),connection_id text not null,online boolean not null default true,last_seen timestamptz not null default now(),primary key(user_id,connection_id));
create table game_private.player_activity(user_id uuid primary key references public.profiles(id),last_seen timestamptz not null default now());
revoke all on game_private.player_sessions,game_private.player_activity from public,anon,authenticated;
create function game_private.are_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from game_private.friendships where status='accepted' and ((requester=a and recipient=b) or (requester=b and recipient=a))) $$;
revoke all on function game_private.are_friends(uuid,uuid) from public,anon,authenticated;
create function public.player_presence(p_connection text,p_online boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_connection is null or p_connection !~ '^[a-zA-Z0-9-]{1,64}$' or p_online is null then raise exception 'INVALID_CONNECTION'; end if;
  delete from game_private.player_sessions where user_id=auth.uid() and last_seen<now()-interval '2 minutes';
  if (select count(*) from game_private.player_sessions where user_id=auth.uid())>=20 and not exists(select 1 from game_private.player_sessions where user_id=auth.uid() and connection_id=p_connection) then raise exception 'RATE_LIMIT'; end if;
  insert into game_private.player_sessions values(auth.uid(),p_connection,p_online,now()) on conflict(user_id,connection_id) do update set online=excluded.online,last_seen=now();
  insert into game_private.player_activity values(auth.uid(),now()) on conflict(user_id) do update set last_seen=now();
end $$;
create function game_private.presence_for(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare visible boolean;
begin
  select not hide_presence and (id=auth.uid() or game_private.are_friends(id,auth.uid())) into visible from public.profiles where id=p_user;
  if not coalesce(visible,false) then return jsonb_build_object('presence','hidden','last_seen',null); end if;
  return jsonb_build_object('presence',case when exists(select 1 from game_private.player_sessions where user_id=p_user and online and last_seen>now()-interval '45 seconds') then 'online' else 'offline' end,'last_seen',(select last_seen from game_private.player_activity where user_id=p_user));
end $$;
revoke all on function game_private.presence_for(uuid) from public,anon,authenticated;
create function public.set_presence_privacy(p_hidden boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  if p_hidden is null then raise exception 'INVALID_PRIVACY'; end if;
  update public.profiles set hide_presence=p_hidden where id=auth.uid() returning * into p;
  if p.id is null then raise exception 'UNAUTHORIZED'; end if;
  return to_jsonb(p);
end $$;
create function public.update_banner(p_color text,p_image text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; image bytea;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_BANNER'; end if;
  if p_image is not null then
    if length(p_image)>400000 or p_image !~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$' then raise exception 'INVALID_BANNER'; end if;
    image:=decode(substr(p_image,24),'base64');
    if octet_length(image)<20 or substring(image from 1 for 4)!=decode('52494646','hex') or substring(image from 9 for 4)!=decode('57454250','hex') then raise exception 'INVALID_BANNER'; end if;
  end if;
  update public.profiles set banner_color=lower(p_color),banner_image=p_image where id=auth.uid() returning * into p;
  return to_jsonb(p);
end $$;
create function public.get_player(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into p from public.profiles where id=p_user;
  if p.id is null then raise exception 'INVALID_PLAYER'; end if;
  return jsonb_build_object('id',p.id,'username',p.username,'avatar',p.avatar,'banner_color',p.banner_color,'banner_image',p.banner_image,'frame',p.frame,'title',p.title,'staff_badge',p.staff_badge,'rating',p.rating,'wins',p.wins,'draws',p.draws,'games',p.games,'level',1+p.wins/5+p.level_bonus,'streak_best',p.streak_best,'category_wins',p.category_wins,'created_at',p.created_at,'friendship',coalesce((select case when status='accepted' then 'friends' when requester=auth.uid() then 'outgoing' else 'incoming' end from game_private.friendships where (requester=p_user and recipient=auth.uid()) or (recipient=p_user and requester=auth.uid())),'none'))||game_private.presence_for(p_user);
end $$;
create function public.request_player_friend(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare code text;
begin
  select friend_code into code from public.profiles where id=p_user;
  if code is null then raise exception 'INVALID_PLAYER'; end if;
  perform public.request_friend(code);
end $$;
revoke all on function public.player_presence(text,boolean),public.set_presence_privacy(boolean),public.update_banner(text,text),public.get_player(uuid),public.request_player_friend(uuid) from public,anon;
grant execute on function public.player_presence(text,boolean),public.set_presence_privacy(boolean),public.update_banner(text,text),public.get_player(uuid),public.request_player_friend(uuid) to authenticated;

create or replace function public.get_friends() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare friends jsonb; incoming jsonb; outgoing jsonb; invites jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'avatar',p.avatar,'frame',p.frame,'title',p.title,'staff_badge',p.staff_badge,'rating',p.rating,'friend_code',p.friend_code)||game_private.presence_for(p.id) order by p.username),'[]'::jsonb) into friends from game_private.friendships f join public.profiles p on p.id=case when f.requester=auth.uid() then f.recipient else f.requester end where auth.uid() in(f.requester,f.recipient) and f.status='accepted';
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'avatar',p.avatar,'frame',p.frame,'title',p.title,'staff_badge',p.staff_badge,'rating',p.rating)),'[]'::jsonb) into incoming from game_private.friendships f join public.profiles p on p.id=f.requester where f.recipient=auth.uid() and f.status='pending';
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'avatar',p.avatar,'frame',p.frame,'title',p.title,'staff_badge',p.staff_badge,'rating',p.rating)),'[]'::jsonb) into outgoing from game_private.friendships f join public.profiles p on p.id=f.recipient where f.requester=auth.uid() and f.status='pending';
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'username',p.username,'category',r.category,'category_title',r.deck->>'title','category_title_en',r.deck->>'titleEn','room_id',r.id,'is_ranked',r.is_ranked)),'[]'::jsonb) into invites from game_private.invites i join public.profiles p on p.id=i.sender join public.rooms r on r.id=i.room_id where i.recipient=auth.uid() and i.created_at>now()-interval '15 minutes' and r.status='waiting';
  return jsonb_build_object('friends',friends,'incoming',incoming,'outgoing',outgoing,'invites',invites);
end;
$$;

