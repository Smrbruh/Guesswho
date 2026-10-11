insert into game_private.shop_items(id,price) values
('frame-aurora',400),('frame-rose',350),('frame-inferno',650),
('emoji-love',160),('emoji-mindblown',180),('emoji-party',180),('emoji-melt',140),('emoji-shock',140),('emoji-spy',200);

create or replace function public.equip_frame(p_item text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null then raise exception 'UNAUTHORIZED'; end if;
  if p_item is null or (p_item!='default' and (not exists(select 1 from game_private.shop_items where id=p_item and id like 'frame-%') or not(p_item=any(p.owned)))) then raise exception 'NOT_OWNED'; end if;
  update public.profiles set frame=p_item where id=auth.uid() returning * into p;
  return to_jsonb(p);
end $$;

alter table public.deck_votes add column created_at timestamptz not null default '-infinity';
alter table public.deck_votes alter column created_at set default now();
create index deck_votes_recent on public.deck_votes(deck_id,created_at);

create or replace function public.vote_deck(p_id text,p_vote integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_vote is null or p_vote not in(-1,0,1) then raise exception 'INVALID_VOTE'; end if;
  perform id from public.decks where id=p_id and published and owner_id!=auth.uid() for share;
  if not found then raise exception 'INVALID_DECK'; end if;
  if p_vote=0 then delete from public.deck_votes where deck_id=p_id and user_id=auth.uid();
  else insert into public.deck_votes(deck_id,user_id,vote) values(p_id,auth.uid(),p_vote) on conflict(deck_id,user_id) do update set vote=excluded.vote; end if;
end $$;

create function public.list_decks(p_search text,p_page integer,p_scope text,p_sort text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_scope is null or p_scope not in('all','community','mine','private','official') or p_sort is null or p_sort not in('trending','popular','newest') then raise exception 'INVALID_FILTER'; end if;
  return coalesce((
    with summaries as (
      select d.id,d.owner_id,p.username as author,d.published,d.created_at,
        d.data->>'title' as title,d.data->>'titleEn' as "titleEn",d.data->>'subtitle' as subtitle,d.data->>'subtitleEn' as "subtitleEn",d.data->>'color' as color,
        d.data->'characters'->0->>'img' as cover,jsonb_array_length(d.data->'characters') as size,
        coalesce(v.likes,0) as likes,coalesce(v.dislikes,0) as dislikes,coalesce(v.recent_score,0) as recent_score,coalesce(v.recent_likes,0) as recent_likes,coalesce(v.my_vote,0) as my_vote
      from public.decks d left join public.profiles p on p.id=d.owner_id
      left join lateral (
        select count(*) filter(where vote=1) as likes,count(*) filter(where vote=-1) as dislikes,
          sum(vote) filter(where created_at>now()-interval '7 days') as recent_score,
          count(*) filter(where vote=1 and created_at>now()-interval '7 days') as recent_likes,
          max(vote) filter(where user_id=auth.uid()) as my_vote
        from public.deck_votes where deck_id=d.id
      ) v on true
      where (d.published or d.owner_id=auth.uid())
        and (p_scope='all' or (p_scope='community' and d.owner_id is not null and d.published) or (p_scope='mine' and d.owner_id=auth.uid()) or (p_scope='private' and d.owner_id=auth.uid() and not d.published) or (p_scope='official' and d.owner_id is null))
        and (d.data->>'title' ilike '%'||left(coalesce(p_search,''),60)||'%' or d.data->>'titleEn' ilike '%'||left(coalesce(p_search,''),60)||'%')
    ), ranked as (
      select s.*,s.published and s.owner_id is not null and s.recent_score>0 as trending
      from summaries s
      order by case when p_sort='trending' and s.published and s.owner_id is not null then greatest(s.recent_score,0) else 0 end desc,
        case when p_sort='popular' then s.likes-s.dislikes else 0 end desc,
        s.created_at desc,s.id
      limit 20 offset least(greatest(coalesce(p_page,0),0),10000)*20
    ) select jsonb_agg(to_jsonb(r)) from ranked r
  ),'[]'::jsonb);
end $$;
create or replace function public.list_decks(p_search text default '',p_page integer default 0) returns jsonb
language sql security definer set search_path='' as $$
  select public.list_decks(p_search,p_page,'all','newest');
$$;
revoke all on function public.list_decks(text,integer,text,text) from public,anon;
grant execute on function public.list_decks(text,integer,text,text) to authenticated;
