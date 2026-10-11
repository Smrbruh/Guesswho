create table game_private.deck_reviews(deck_id text primary key references public.decks(id),owner_id uuid not null references public.profiles(id),snapshot jsonb not null,status text not null check(status in('pending','approved','rejected','changed')),note text not null default '',submitted_at timestamptz not null default now(),reviewed_at timestamptz,reviewer_id uuid references public.profiles(id),rewarded_at timestamptz);
revoke all on game_private.deck_reviews from public,anon,authenticated;
create function game_private.is_developer() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and 'developer'=any(special_titles)) $$;
revoke all on function game_private.is_developer() from public,anon,authenticated;
create function public.submit_deck_review(p_id text) returns void language plpgsql security definer set search_path='' as $$
declare d public.decks; review game_private.deck_reviews;
begin
  select * into d from public.decks where id=p_id and owner_id=auth.uid() for update;
  if d.id is null then raise exception 'NOT_OWNED'; end if;
  if jsonb_array_length(d.data->'characters')<24 then raise exception 'INVALID_REVIEW_SIZE'; end if;
  select * into review from game_private.deck_reviews where deck_id=p_id for update;
  if review.status in('pending','approved') or review.rewarded_at is not null then raise exception 'INVALID_REVIEW_STATE'; end if;
  insert into game_private.deck_reviews(deck_id,owner_id,snapshot,status) values(p_id,auth.uid(),d.data,'pending') on conflict(deck_id) do update set snapshot=excluded.snapshot,status='pending',note='',submitted_at=now(),reviewed_at=null,reviewer_id=null;
end $$;
create function public.list_deck_reviews(p_queue boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_queue and not game_private.is_developer() then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.submitted_at) from (select r.deck_id,r.owner_id,p.username,r.status,r.note,r.submitted_at,r.reviewed_at,r.rewarded_at,r.snapshot->>'title' as title,r.snapshot->>'titleEn' as title_en,jsonb_array_length(r.snapshot->'characters') as size from game_private.deck_reviews r join public.profiles p on p.id=r.owner_id where case when p_queue then r.status='pending' else r.owner_id=auth.uid() end) r),'[]');
end $$;
create function public.get_deck_review(p_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r game_private.deck_reviews;
begin
  select * into r from game_private.deck_reviews where deck_id=p_id;
  if r.deck_id is null or (r.owner_id is distinct from auth.uid() and not game_private.is_developer()) then raise exception 'UNAUTHORIZED'; end if;
  return to_jsonb(r);
end $$;
create function public.review_deck(p_id text,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare d public.decks; r game_private.deck_reviews;
begin
  if not game_private.is_developer() then raise exception 'UNAUTHORIZED'; end if;
  select * into d from public.decks where id=p_id for update;
  select * into r from game_private.deck_reviews where deck_id=p_id for update;
  if r.deck_id is null or r.owner_id=auth.uid() or r.status!='pending' or r.rewarded_at is not null then raise exception 'INVALID_REVIEW_STATE'; end if;
  if r.snapshot is distinct from d.data then raise exception 'INVALID_REVIEW_CHANGED'; end if;
  if p_approve is null or p_note is null or length(p_note)>500 or (not p_approve and length(trim(p_note))<3) then raise exception 'INVALID_REVIEW_NOTE'; end if;
  update game_private.deck_reviews set status=case when p_approve then 'approved' else 'rejected' end,note=trim(p_note),reviewer_id=auth.uid(),reviewed_at=now(),rewarded_at=case when p_approve then now() else null end where deck_id=p_id;
  if p_approve then update public.profiles set coins=coins+750 where id=r.owner_id; end if;
end $$;
create function game_private.invalidate_deck_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.data is distinct from old.data then update game_private.deck_reviews set status='changed',note='' where deck_id=new.id and status in('pending','approved'); end if;
  return new;
end $$;
create trigger invalidate_deck_review after update of data on public.decks for each row execute function game_private.invalidate_deck_review();
revoke all on function game_private.invalidate_deck_review() from public,anon,authenticated;
revoke all on function public.submit_deck_review(text),public.list_deck_reviews(boolean),public.get_deck_review(text),public.review_deck(text,boolean,text) from public,anon;
grant execute on function public.submit_deck_review(text),public.list_deck_reviews(boolean),public.get_deck_review(text),public.review_deck(text,boolean,text) to authenticated;
