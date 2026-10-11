alter table public.rooms add column round_number integer not null default 1;
alter table public.rooms add column deck_revision integer not null default 0;
alter table public.rooms add column host_rematch boolean not null default false;
alter table public.rooms add column guest_rematch boolean not null default false;
alter table game_private.boards add column closed_move integer not null default -1;
create table game_private.match_results(id uuid primary key default gen_random_uuid(),room_id uuid not null,round_number integer not null,host_id uuid not null,guest_id uuid not null,category text not null,is_ranked boolean not null,finished_at timestamptz not null,outcome text not null,winner_id uuid,rating_changes jsonb not null,unique(room_id,round_number));
insert into game_private.match_results(room_id,round_number,host_id,guest_id,category,is_ranked,finished_at,outcome,winner_id,rating_changes) select id,round_number,host_id,guest_id,category,is_ranked,finished_at,outcome,winner_id,rating_changes from public.rooms where outcome in('win','draw') and guest_id is not null;
revoke all on game_private.match_results from public,anon,authenticated;
create function game_private.archive_round() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='finished' and new.outcome in('win','draw') then
    insert into game_private.match_results(room_id,round_number,host_id,guest_id,category,is_ranked,finished_at,outcome,winner_id,rating_changes) values(new.id,new.round_number,new.host_id,new.guest_id,new.category,new.is_ranked,new.finished_at,new.outcome,new.winner_id,new.rating_changes) on conflict(room_id,round_number) do nothing;
  end if;
  return new;
end $$;
create trigger archive_round after update of status on public.rooms for each row execute function game_private.archive_round();
revoke all on function game_private.archive_round() from public,anon,authenticated;
create or replace function game_private.complete_match(p_room uuid,p_winner uuid,p_forfeit boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms; h public.profiles; g public.profiles; delta integer:=0; reward integer:=0; eligible boolean; score numeric; changes jsonb:='{}';
begin
  select * into r from public.rooms where id=p_room for update;
  if r.id is null or r.status!='playing' or (p_winner is not null and p_winner not in (r.host_id,r.guest_id)) then raise exception 'INVALID_STATE'; end if;
  perform id from public.profiles where id in (r.host_id,r.guest_id) order by id for update;
  select * into h from public.profiles where id=r.host_id;
  select * into g from public.profiles where id=r.guest_id;
  eligible:=r.moves>=2 and r.started_at<now()-interval '30 seconds';
  if eligible then
    if r.is_ranked then
    score:=case when p_winner is null then 0.5 when p_winner=r.host_id then 1 else 0 end;
    delta:=round(32*(score-1/(1+power(10::numeric,(g.rating-h.rating)::numeric/400))))::integer;
    if p_winner=r.host_id then delta:=greatest(1,delta); elsif p_winner=r.guest_id then delta:=least(-1,delta); end if;
    delta:=greatest(-h.rating,least(g.rating,delta));
    changes:=jsonb_build_object(r.host_id::text,delta,r.guest_id::text,-delta);
    update public.profiles set rating=rating+case when id=r.host_id then delta else -delta end,rated_games=rated_games+1 where id in(r.host_id,r.guest_id);
    end if;
    if p_winner is not null and not p_forfeit then
      update public.profiles set category_wins=jsonb_set(category_wins,array[r.category],to_jsonb(coalesce((category_wins->>r.category)::integer,0)+1)) where id=p_winner;
      if (select count(*) from game_private.match_results where winner_id=p_winner and finished_at>now()-interval '24 hours')<20 then reward:=50; end if;
    end if;
  end if;
  update public.rooms set status='finished',outcome=case when p_winner is null then 'draw' else 'win' end,winner_id=p_winner,turn_id=null,pending_winner=null,finished_at=now(),rating_changes=changes where id=p_room;
  update public.profiles set games=games+1,wins=wins+case when id=p_winner then 1 else 0 end,draws=draws+case when p_winner is null then 1 else 0 end,coins=coins+case when id=p_winner then reward else 0 end where id in(r.host_id,r.guest_id);
  if not p_forfeit then perform game_private.record_daily_match(r.host_id); perform game_private.record_daily_match(r.guest_id); end if;
  return jsonb_build_object('winner_id',p_winner,'reward',reward,'rating_changes',changes,'draw',p_winner is null);
end $$;

create or replace function public.match_history(p_opponent uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare total bigint; won bigint; drawn bigint; opponents jsonb; matches jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select count(*),count(*) filter(where winner_id=auth.uid()),count(*) filter(where outcome='draw') into total,won,drawn from game_private.match_results where outcome in('win','draw') and auth.uid() in(host_id,guest_id) and (p_opponent is null or p_opponent in(host_id,guest_id));
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into opponents from (select distinct p.id,p.username from game_private.match_results r join public.profiles p on p.id=case when r.host_id=auth.uid() then r.guest_id else r.host_id end where auth.uid() in(r.host_id,r.guest_id) and r.outcome in('win','draw') order by p.username) p;
  select coalesce(jsonb_agg(to_jsonb(m)),'[]') into matches from (select r.id,r.category,r.is_ranked,r.finished_at,r.outcome,r.winner_id,p.username as opponent_name,p.id as opponent_id,r.rating_changes->>auth.uid()::text as rating_change from game_private.match_results r join public.profiles p on p.id=case when r.host_id=auth.uid() then r.guest_id else r.host_id end where auth.uid() in(r.host_id,r.guest_id) and r.outcome in('win','draw') and (p_opponent is null or p.id=p_opponent) order by r.finished_at desc limit 30) m;
  return jsonb_build_object('games',total,'wins',won,'draws',drawn,'losses',total-won-drawn,'opponents',opponents,'matches',matches);
end $$;


create or replace function public.select_secret(p_room uuid,p_character text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null or r.status not in('waiting','selecting') then raise exception 'INVALID_STATE'; end if;
  if not game_private.room_has_character(r,p_character) then raise exception 'INVALID_CHARACTER'; end if;
  insert into game_private.secrets values(p_room,auth.uid(),p_character) on conflict(room_id,user_id) do update set character_id=excluded.character_id;
  update public.rooms set host_ready=host_ready or host_id=auth.uid(),guest_ready=guest_ready or coalesce(guest_id=auth.uid(),false) where id=p_room returning * into r;
  if r.host_ready and r.guest_ready then update public.rooms set status='playing',turn_id=case when round_number%2=1 then host_id else guest_id end,started_at=now() where id=p_room; end if;
end $$;

create function public.change_room_deck(p_room uuid,p_category text) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms; pack jsonb;
begin
  select * into r from public.rooms where id=p_room and host_id=auth.uid() for update;
  if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status='playing' or r.outcome='cancelled' then raise exception 'INVALID_STATE'; end if;
  select data into pack from public.decks where id=p_category and (published or owner_id=auth.uid());
  if pack is null then raise exception 'DECK_NOT_FOUND'; end if;
  update public.rooms set category=p_category,deck=pack,deck_revision=deck_revision+1,host_ready=false,guest_ready=false,host_rematch=false,guest_rematch=false where id=p_room;
  delete from game_private.secrets where room_id=p_room;
  delete from game_private.boards where room_id=p_room;
end $$;
create function public.request_rematch(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id=p_room and auth.uid() in(host_id,guest_id) for update;
  if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status!='finished' or r.outcome not in('win','draw') or r.guest_id is null then raise exception 'INVALID_STATE'; end if;
  update public.rooms set host_rematch=host_rematch or host_id=auth.uid(),guest_rematch=guest_rematch or guest_id=auth.uid() where id=p_room returning * into r;
  if r.host_rematch and r.guest_rematch then
    delete from game_private.secrets where room_id=p_room;
    delete from game_private.boards where room_id=p_room;
    update public.rooms set round_number=round_number+1,status='selecting',host_ready=false,guest_ready=false,host_rematch=false,guest_rematch=false,turn_id=null,winner_id=null,pending_winner=null,started_at=null,finished_at=null,outcome=null,rating_changes='{}',moves=0 where id=p_room;
  end if;
end $$;
revoke all on function public.change_room_deck(uuid,text),public.request_rematch(uuid) from public,anon;
grant execute on function public.change_room_deck(uuid,text),public.request_rematch(uuid) to authenticated;
